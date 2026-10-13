import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { Room, Resident, Payment, Warden, Session, ServiceRequest } from '../src/models.js';
import { hashPassword } from '../src/auth.js';
import { seedDemo, demoResidents } from '../src/seed.js';
let mongo, server, base, wardenCookie;
const password = 'Test-only-password-2026';
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24', ...(process.platform === 'linux' ? { os: { os: 'linux', dist: 'ubuntu', release: '22.04' } } : {}) } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Room.init(), Resident.init(), Payment.init(), Warden.init(), Session.init(), ServiceRequest.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  await Warden.create({ name: 'Test Warden', email: 'test.warden@example.com', passwordHash: await hashPassword(password) });
  const signedIn = await request('auth/login', { role: 'warden', email: 'test.warden@example.com', password }, null);
  assert.equal(signedIn.status, 200);
  wardenCookie = signedIn.cookie;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
async function request(path, body, cookie = wardenCookie, method = 'POST', headers = {}) {
  const response = await fetch(`${base}/${path}`, { ...(body ? { method, body: JSON.stringify(body) } : {}), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers } });
  assert.match(response.headers.get('content-type'), /application\/json/);
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
test('resident assignment cannot overbook under concurrent requests; duplicate emails are rejected', async () => {
  const room = await request('rooms', { number: 'TEST-1', floor: 1, capacity: 2, hostel: 'Boys Hostel', rent: 3500 });
  assert.equal(room.status, 201);
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => request('residents', { name: `Resident ${i}`, email: `resident${i}@example.com`, password, course: 'Engineering', gender: 'Male', room: room.body._id })));
  assert.equal(results.filter(r => r.status === 201).length, 2);
  assert.equal(results.filter(r => r.status === 409).length, 3);
  const residents = await Resident.find({ room: room.body._id });
  assert.equal(new Set(residents.map(r => r.bed)).size, 2);
  const next = await request('rooms', { number: 'TEST-2', floor: 2, capacity: 1, hostel: 'Boys Hostel', rent: 4500 });
  const duplicate = await request('residents', { name: 'Duplicate', email: residents[0].email.toUpperCase(), password, course: 'Architecture', gender: 'Male', room: next.body._id });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.message, /email already exists/);
});
test('monthly payment uses room rent and rejects duplicates and invalid input', async () => {
  const resident = await Resident.findOne();
  const first = await request('payments', { resident: resident._id, month: '2026-10', method: 'Cash', amount: 1 });
  assert.equal(first.status, 201);
  assert.equal(first.body.amount, 3500);
  const duplicate = await request('payments', { resident: resident._id, month: '2026-10', method: 'Card' });
  assert.equal(duplicate.status, 409);
  const invalid = await request('payments', { resident: resident._id, month: '2026-13', method: 'Cash' });
  assert.equal(invalid.status, 400);
  const nonexistent = await request('payments', { resident: new mongoose.Types.ObjectId(), month: '2026-11', method: 'Cash' });
  assert.equal(nonexistent.status, 404);
});
test('room validation and aggregate data return consistent records', async () => {
  assert.equal((await request('rooms', { number: 'bad', floor: 1, capacity: 7, hostel: 'Boys Hostel', rent: 3500 })).status, 400);
  assert.equal((await request('rooms', { number: 'TEST-1', floor: 1, capacity: 1, hostel: 'Boys Hostel', rent: 3500 })).status, 409);
  assert.equal((await request('residents', { name: 'Bad', email: 'bad', room: 'bad' })).status, 400);
  const data = await request('data');
  assert.equal(data.status, 200);
  assert.equal(data.body.residents.length, 2);
  assert.equal(data.body.payments.length, 1);
  assert.equal(data.body.payments[0].resident.room.number, 'TEST-1');
  assert.equal((await request('health')).body.status, 'ok');
  assert.equal((await request('missing')).status, 404);
});


test('registration rejects missing gender and assignments to the wrong hostel', async () => {
  const boys = await Room.findOne({ number: 'TEST-2' });
  const girls = await request('rooms', { number: 'G-TEST', hostel: 'Girls Hostel', floor: 1, capacity: 2, rent: 4500 });
  assert.equal(girls.status, 201);
  const person = { name: 'Test Resident', email: 'assignment@example.com', course: 'Engineering', password };
  assert.equal((await request('residents', { ...person, room: boys._id })).status, 400);
  assert.equal((await request('residents', { ...person, gender: 'Unknown', room: boys._id })).status, 400);
  const wrongBoys = await request('residents', { ...person, gender: 'Female', room: boys._id });
  assert.equal(wrongBoys.status, 409);
  assert.match(wrongBoys.body.message, /Girls Hostel/);
  const wrongGirls = await request('residents', { ...person, gender: 'Male', room: girls.body._id });
  assert.equal(wrongGirls.status, 409);
  assert.match(wrongGirls.body.message, /Boys Hostel/);
  assert.equal(await Resident.countDocuments({ email: person.email }), 0);
  assert.equal((await request('rooms', { number: 'MISSING', floor: 1, capacity: 2, rent: 3500 })).status, 400);
  assert.equal((await request('rooms', { number: 'INVALID', hostel: 'Mixed', floor: 1, capacity: 2, rent: 3500 })).status, 400);
});

test('Girls Hostel accepts matching residents and charges the configured rent', async () => {
  const girls = await Room.findOne({ number: 'G-TEST' });
  const result = await request('residents', { name: 'Anjali Rao', email: 'anjali.rao@example.com', password, course: 'Architecture', gender: 'Female', room: girls._id });
  assert.equal(result.status, 201);
  assert.equal(result.body.gender, 'Female');
  assert.equal(result.body.room.hostel, 'Girls Hostel');
  const paid = await request('payments', { resident: result.body._id, month: '2026-10', method: 'Card', amount: 450 });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.amount, 4500);
  const boys = await Room.findOne({ number: 'TEST-2' });
  const male = await request('residents', { name: 'Arun Rao', email: 'arun.rao@example.com', password, course: 'Architecture', gender: 'Male', room: boys._id });
  assert.equal(male.status, 201);
  assert.equal(male.body.room.hostel, 'Boys Hostel');
});

test('demo seed keeps separate hostels and rooms, realistic rents, and matching payments', async () => {
  await Payment.deleteMany({});
  await Resident.deleteMany({});
  await Room.deleteMany({});
  await seedDemo();
  await seedDemo();
  const rooms = await Room.find().lean();
  const residents = await Resident.find().populate('room').lean();
  const payments = await Payment.find().populate({ path: 'resident', populate: { path: 'room' } }).lean();
  assert.equal(rooms.length, 12);
  assert.equal(residents.length, 20);
  assert.equal(payments.length, 13);
  assert.deepEqual(new Set(rooms.map(r => r.hostel)), new Set(['Boys Hostel', 'Girls Hostel']));
  for (const hostel of ['Boys Hostel', 'Girls Hostel']) assert.equal(rooms.filter(r => r.hostel === hostel).length, 6);
  for (const resident of residents) {
    assert.equal(resident.gender, demoResidents.find(r => r.name === resident.name).gender);
    assert.equal(resident.room.hostel, resident.gender === 'Male' ? 'Boys Hostel' : 'Girls Hostel');
    assert.ok(resident.bed >= 1 && resident.bed <= resident.room.capacity);
  }
  for (const room of rooms) {
    const occupants = residents.filter(r => r.room._id.equals(room._id));
    assert.ok(occupants.length <= room.capacity);
    assert.ok(new Set(occupants.map(r => r.gender)).size <= 1);
    assert.equal(new Set(occupants.map(r => r.bed)).size, occupants.length);
    assert.equal(room.rent, room.capacity === 2 ? 4500 : 3500);
  }
  for (const payment of payments) assert.equal(payment.amount, payment.resident.room.rent);
});


test('cookie sessions authenticate both roles and keep student data private', async () => {
  assert.equal((await request('data', null, null)).status, 401);
  assert.equal((await request('rooms', { number: 'UNAUTH' }, null)).status, 401);
  const me = await request('auth/me');
  assert.equal(me.body.user.role, 'warden');
  const room = await Room.findOne({ hostel: 'Girls Hostel', number: 'G-301' });
  const created = await request('residents', { name: 'Nisha Rao', email: 'nisha.rao@example.com', password, course: 'Architecture', gender: 'Female', room: room._id });
  assert.equal(created.status, 201);
  assert.equal(created.body.passwordHash, undefined);
  const stored = await Resident.findById(created.body._id).select('+passwordHash');
  assert.ok(stored.passwordHash);
  assert.notEqual(stored.passwordHash, password);
  const wrong = await request('auth/login', { role: 'student', email: 'nisha.rao@example.com', password: 'Wrong-password' }, null);
  assert.equal(wrong.status, 401);
  const login = await request('auth/login', { role: 'student', email: 'NISHA.RAO@example.com', password }, null);
  assert.equal(login.status, 200);
  assert.ok(login.cookie);
  assert.equal(login.body.user.role, 'student');
  assert.equal(login.body.user.passwordHash, undefined);
  const scoped = await request('data', null, login.cookie);
  assert.equal(scoped.body.residents.length, 1);
  assert.equal(scoped.body.residents[0]._id, created.body._id);
  assert.equal(scoped.body.rooms.length, 1);
  assert.equal(scoped.body.payments.length, 0);
  assert.equal(scoped.body.residents[0].passwordHash, undefined);
  for (const route of ['rooms', 'residents', 'payments']) assert.equal((await request(route, {}, login.cookie)).status, 403);
  assert.equal((await request(`residents/${created.body._id}/password`, { password }, login.cookie, 'PATCH')).status, 403);
  const submitted = await request('requests', { title: 'Repair light', message: 'The desk light is not working.', resident: new mongoose.Types.ObjectId(), status: 'Resolved' }, login.cookie);
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.resident, created.body._id);
  assert.equal(submitted.body.status, 'Open');
  assert.equal((await request(`requests/${submitted.body._id}`, { status: 'Resolved' }, login.cookie, 'PATCH')).status, 403);
  const changed = await request(`requests/${submitted.body._id}`, { status: 'Resolved' }, wardenCookie, 'PATCH');
  assert.equal(changed.status, 200);
  assert.equal(changed.body.status, 'Resolved');
  assert.equal((await request('data', null, login.cookie)).body.requests[0].status, 'Resolved');
  const other = await Resident.findOne({ email: 'aarav.sharma@example.com' });
  await request(`residents/${other._id}/password`, { password: 'Other-test-password' }, wardenCookie, 'PATCH');
  const second = await request('auth/login', { role: 'student', email: other.email, password: 'Other-test-password' }, null);
  assert.equal(second.status, 200);
  assert.equal((await request('data', null, second.cookie)).body.requests.length, 0);
  const reset = await request(`residents/${created.body._id}/password`, { password: 'Updated-test-password' }, wardenCookie, 'PATCH');
  assert.equal(reset.status, 200);
  assert.equal((await request('data', null, login.cookie)).status, 401);
  const relogin = await request('auth/login', { role: 'student', email: stored.email, password: 'Updated-test-password' }, null);
  assert.equal(relogin.status, 200);
  assert.equal((await request('auth/logout', {}, relogin.cookie)).status, 200);
  assert.equal((await request('data', null, relogin.cookie)).status, 401);
});

test('expired sessions, invalid mutations, and demo access are controlled', async () => {
  const loggedIn = await request('auth/login', { role: 'warden', email: 'test.warden@example.com', password }, null);
  const token = loggedIn.cookie.split('=')[1];
  const { createHash } = await import('node:crypto');
  await Session.updateOne({ tokenHash: createHash('sha256').update(token).digest('hex') }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await request('data', null, loggedIn.cookie)).status, 401);
  assert.equal((await request('auth/demo', { role: 'warden' }, null)).status, 403);
  assert.equal((await request('rooms', { number: 'CSRF' }, wardenCookie, 'POST', { Origin: 'https://other.example' })).status, 403);
  assert.equal((await request('rooms', { number: 'DEV' }, wardenCookie, 'POST', { Origin: 'http://localhost:5173' })).status, 400);
  assert.equal((await request('requests', { title: 'Test', message: 'Test' })).status, 403);
  const resident = await Resident.findOne();
  assert.equal((await request(`residents/${resident._id}/password`, { password: 'short' }, wardenCookie, 'PATCH')).status, 400);
  assert.equal((await request(`requests/${new mongoose.Types.ObjectId()}`, { status: 'Invalid' }, wardenCookie, 'PATCH')).status, 400);
  const badJson = await fetch(`${base}/residents`, { method: 'POST', headers: { Cookie: wardenCookie, 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(badJson.status, 400);
  assert.match(badJson.headers.get('content-type'), /application\/json/);
  assert.equal((await request('missing', {}, null)).status, 404);
});
