import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { Room, Resident, Payment } from '../src/models.js';
import { seedDemo, demoResidents } from '../src/seed.js';
let mongo, server, base;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.24', ...(process.platform === 'linux' ? { os: { os: 'linux', dist: 'ubuntu', release: '22.04' } } : {}) } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([Room.init(), Resident.init(), Payment.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
async function request(path, body) {
  const response = await fetch(`${base}/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return { status: response.status, body: await response.json() };
}
test('resident assignment cannot overbook under concurrent requests; duplicate emails are rejected', async () => {
  const room = await request('rooms', { number: 'TEST-1', floor: 1, capacity: 2, hostel: 'Boys Hostel', rent: 3500 });
  assert.equal(room.status, 201);
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => request('residents', { name: `Resident ${i}`, email: `resident${i}@example.com`, course: 'Engineering', gender: 'Male', room: room.body._id })));
  assert.equal(results.filter(r => r.status === 201).length, 2);
  assert.equal(results.filter(r => r.status === 409).length, 3);
  const residents = await Resident.find({ room: room.body._id });
  assert.equal(new Set(residents.map(r => r.bed)).size, 2);
  const next = await request('rooms', { number: 'TEST-2', floor: 2, capacity: 1, hostel: 'Boys Hostel', rent: 4500 });
  const duplicate = await request('residents', { name: 'Duplicate', email: residents[0].email.toUpperCase(), course: 'Architecture', gender: 'Male', room: next.body._id });
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
  const person = { name: 'Test Resident', email: 'assignment@example.com', course: 'Engineering' };
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
  const result = await request('residents', { name: 'Anjali Rao', email: 'anjali.rao@example.com', course: 'Architecture', gender: 'Female', room: girls._id });
  assert.equal(result.status, 201);
  assert.equal(result.body.gender, 'Female');
  assert.equal(result.body.room.hostel, 'Girls Hostel');
  const paid = await request('payments', { resident: result.body._id, month: '2026-10', method: 'Card', amount: 450 });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.amount, 4500);
  const boys = await Room.findOne({ number: 'TEST-2' });
  const male = await request('residents', { name: 'Arun Rao', email: 'arun.rao@example.com', course: 'Architecture', gender: 'Male', room: boys._id });
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
