import { Room, Resident, Payment } from './models.js';

export const demoResidents = [
  { name: 'Aarav Sharma', gender: 'Male' },
  { name: 'Ayesha Khan', gender: 'Female' },
  { name: 'Priya Patel', gender: 'Female' },
  { name: 'Mohammed Ali', gender: 'Male' },
  { name: 'Rohan Verma', gender: 'Male' },
  { name: 'Fatima Sheikh', gender: 'Female' },
  { name: 'Ananya Gupta', gender: 'Female' },
  { name: 'Arjun Reddy', gender: 'Male' },
  { name: 'Zoya Ansari', gender: 'Female' },
  { name: 'Aditya Singh', gender: 'Male' },
  { name: 'Meera Iyer', gender: 'Female' },
  { name: 'Imran Ahmed', gender: 'Male' },
  { name: 'Kavya Nair', gender: 'Female' },
  { name: 'Rahul Joshi', gender: 'Male' },
  { name: 'Sana Mirza', gender: 'Female' },
  { name: 'Vikram Desai', gender: 'Male' },
  { name: 'Ishaan Kapoor', gender: 'Male' },
  { name: 'Sahil Khan', gender: 'Male' },
  { name: 'Neha Mishra', gender: 'Female' },
  { name: 'Rehan Siddiqui', gender: 'Male' }
];

export async function seedDemo() {
  if (await Room.countDocuments()) return;
  const rooms = await Room.insertMany(['Boys Hostel', 'Girls Hostel'].flatMap(hostel =>
    Array.from({ length: 6 }, (_, i) => ({
      number: `${hostel === 'Boys Hostel' ? 'B' : 'G'}-${Math.floor(i / 2) + 1}0${i % 2 + 1}`,
      hostel, floor: Math.floor(i / 2) + 1,
      capacity: i % 3 === 0 ? 2 : 3, rent: i % 3 === 0 ? 4500 : 3500
    }))
  ));
  const courses = ['Computer Science', 'Business Administration', 'Architecture', 'Mechanical Engineering'];
  const occupied = new Map();
  const records = demoResidents.map(({ name, gender }, i) => {
    const hostel = gender === 'Male' ? 'Boys Hostel' : 'Girls Hostel';
    const room = rooms.find(r => r.hostel === hostel && (occupied.get(r.number) || 0) < r.capacity);
    const bed = (occupied.get(room.number) || 0) + 1;
    occupied.set(room.number, bed);
    return { name, gender, email: `${name.toLowerCase().replace(' ', '.')}@example.com`, phone: `+91 90000 ${String(i).padStart(5, '0')}`, course: courses[i % 4], room: room._id, bed, joinedAt: new Date(Date.now() - (30 - i) * 86400000) };
  });
  const residents = await Resident.insertMany(records);
  const month = new Date().toISOString().slice(0, 7);
  await Payment.insertMany(residents.slice(0, 13).map((r, i) => ({ resident: r._id, month, amount: rooms.find(room => room._id.equals(r.room)).rent, method: ['Bank transfer', 'Card', 'Cash'][i % 3], paidAt: new Date(Date.now() - i * 86400000) })));
}
