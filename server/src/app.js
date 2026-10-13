import express from 'express';
import mongoose from 'mongoose';
import { Room, Resident, Payment } from './models.js';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ message: 'A JSON object is required.' });
  next();
});
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const clean = value => typeof value === 'string' ? value.trim() : '';
const validId = id => mongoose.isValidObjectId(id);
app.get('/api/health', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable' }));
app.get('/api/data', async (req, res) => {
  const [rooms, residents, payments] = await Promise.all([
    Room.find().sort({ number: 1 }).lean(), Resident.find().populate('room').sort({ joinedAt: -1 }).lean(),
    Payment.find().populate({ path: 'resident', populate: { path: 'room' } }).sort({ paidAt: -1 }).lean()
  ]);
  res.json({ rooms, residents, payments });
});
app.post('/api/residents', async (req, res) => {
  const name = clean(req.body.name), email = clean(req.body.email).toLowerCase(), course = clean(req.body.course), phone = clean(req.body.phone), gender = clean(req.body.gender);
  if (!['Male', 'Female'].includes(gender) || !name || name.length > 80 || !course || course.length > 80 || phone.length > 30 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validId(req.body.room)) throw fail('Enter a name, gender, valid email, course, and available room.');
  const room = await Room.findById(req.body.room);
  if (!room) throw fail('Room not found.', 404);
  const hostel = gender === 'Male' ? 'Boys Hostel' : 'Girls Hostel';
  if (room.hostel !== hostel) throw fail(`Choose a room in ${hostel}.`, 409);
  if (await Resident.exists({ room: room._id, gender: { $ne: gender } })) throw fail('This room has an incompatible assignment. Choose another room.', 409);
  // The unique room/bed index makes concurrent assignments safe.
  for (let attempt = 0; attempt < room.capacity; attempt++) {
    const occupied = await Resident.find({ room: room._id }).distinct('bed');
    const bed = Array.from({ length: room.capacity }, (_, i) => i + 1).find(b => !occupied.includes(b));
    if (!bed) throw fail('This room is full. Choose another room.', 409);
    try {
      const resident = await Resident.create({ name, gender, email, course, phone, room: room._id, bed });
      return res.status(201).json(await resident.populate('room'));
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.email) throw fail('A resident with this email already exists.', 409);
      if (error.code !== 11000) throw error;
    }
  }
  throw fail('The room was just filled. Choose another room.', 409);
});
app.post('/api/rooms', async (req, res) => {
  const number = clean(req.body.number), { hostel, floor, capacity, rent } = req.body;
  if (!['Boys Hostel', 'Girls Hostel'].includes(hostel) || !/^[A-Za-z0-9-]{1,10}$/.test(number) || !Number.isInteger(floor) || floor < 0 || floor > 100 || !Number.isInteger(capacity) || capacity < 1 || capacity > 6 || !Number.isInteger(rent) || rent < 1 || rent > 100000) throw fail('Choose a hostel and enter a room number, floor, 1–6 beds, and a positive monthly rent in whole rupees.');
  try { res.status(201).json(await Room.create({ number, hostel, floor, capacity, rent })); }
  catch (error) { if (error.code === 11000) throw fail('This room number already exists.', 409); throw error; }
});
app.post('/api/payments', async (req, res) => {
  const { resident: id, month, method } = req.body;
  if (!validId(id) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') || !['Bank transfer', 'Cash', 'Card'].includes(method)) throw fail('Choose a resident, valid month, and payment method.');
  const resident = await Resident.findById(id).populate('room');
  if (!resident) throw fail('Resident not found.', 404);
  try { res.status(201).json(await Payment.create({ resident: id, month, method, amount: resident.room.rent })); }
  catch (error) { if (error.code === 11000) throw fail('This resident has already paid for this month.', 409); throw error; }
});
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((error, req, res, next) => {
  const status = error.status || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : error.message });
});
export default app;
