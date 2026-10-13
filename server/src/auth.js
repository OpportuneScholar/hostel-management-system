import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Resident, Warden, Session } from './models.js';
const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
export const validPassword = password => typeof password === 'string' && password.length >= 8 && password.length <= 128;
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(password, hash) {
  const [salt, saved] = (hash || '').split(':');
  const key = await scrypt(password, salt || 'missing-account', 64);
  return !!saved && /^[a-f0-9]{128}$/.test(saved) && timingSafeEqual(Buffer.from(saved, 'hex'), key);
}
function sessionToken(req) {
  const value = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('haven_session='))?.slice(14);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
const actor = (user, role) => ({ id: user._id.toString(), name: user.name, email: user.email, role });
const cookieOptions = req => ({ httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/' });
async function login(req, res, user, role) {
  const old = sessionToken(req);
  if (old) await Session.deleteOne({ tokenHash: digest(old) });
  const token = randomBytes(32).toString('hex');
  await Session.create({ tokenHash: digest(token), userId: user._id, role, expiresAt: new Date(Date.now() + 86400000) });
  res.cookie('haven_session', token, { ...cookieOptions(req), maxAge: 86400000 });
  res.json({ user: actor(user, role) });
}
export async function authenticate(req, res, next) {
  const token = sessionToken(req);
  const session = token && await Session.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } });
  const user = session && await (session.role === 'warden' ? Warden : Resident).findById(session.userId);
  if (!user) return res.status(401).json({ message: 'Please sign in to continue.' });
  req.user = actor(user, session.role);
  next();
}
export const wardenOnly = (req, res, next) => req.user.role === 'warden' ? next() : res.status(403).json({ message: 'Only wardens can manage residents, rooms, and payments.' });

export const auth = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many sign-in attempts. Please try again later.' } });
auth.get('/options', (req, res) => res.json({ demo: process.env.SEED_DEMO === 'true' }));
auth.post('/login', limiter, async (req, res) => {
  const { role, password } = req.body;
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!['warden', 'student'].includes(role) || !email || email.length > 254 || !validPassword(password)) return res.status(400).json({ message: 'Enter your role, email, and password (8–128 characters).' });
  const user = await (role === 'warden' ? Warden : Resident).findOne({ email }).select('+passwordHash');
  if (!await checkPassword(password, user?.passwordHash)) return res.status(401).json({ message: 'Incorrect email or password.' });
  await login(req, res, user, role);
});
auth.post('/demo', limiter, async (req, res) => {
  if (process.env.SEED_DEMO !== 'true') return res.status(403).json({ message: 'Demo access is disabled.' });
  const { role } = req.body;
  if (!['warden', 'student'].includes(role)) return res.status(400).json({ message: 'Choose a valid role.' });
  const user = await (role === 'warden' ? Warden : Resident).findOne({ email: role === 'warden' ? 'warden@example.com' : 'aarav.sharma@example.com' });
  if (!user) return res.status(503).json({ message: 'Demo accounts are not ready. Please contact the host.' });
  await login(req, res, user, role);
});
auth.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
auth.post('/logout', async (req, res) => {
  const token = sessionToken(req);
  if (token) await Session.deleteOne({ tokenHash: digest(token) });
  res.clearCookie('haven_session', cookieOptions(req));
  res.json({ message: 'Signed out.' });
});

export async function prepareAccounts() {
  if (process.env.WARDEN_EMAIL || process.env.WARDEN_PASSWORD) {
    if (!process.env.WARDEN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.WARDEN_EMAIL) || !validPassword(process.env.WARDEN_PASSWORD)) throw new Error('Set a valid WARDEN_EMAIL and WARDEN_PASSWORD (8–128 characters).');
    const email = process.env.WARDEN_EMAIL.trim().toLowerCase();
    if (!await Warden.exists({ email })) await Warden.create({ name: process.env.WARDEN_NAME || 'Hostel Warden', email, passwordHash: await hashPassword(process.env.WARDEN_PASSWORD) });
  }
  if (process.env.SEED_DEMO === 'true' && !await Warden.exists({ email: 'warden@example.com' })) {
    await Warden.create({ name: 'Aman Mehta', email: 'warden@example.com', passwordHash: await hashPassword(randomBytes(32).toString('hex')) });
  }
}
