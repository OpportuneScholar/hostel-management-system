import mongoose from 'mongoose';
const roomSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  hostel: { type: String, enum: ['Boys Hostel', 'Girls Hostel'], required: true },
  floor: { type: Number, required: true, min: 0 },
  capacity: { type: Number, required: true, min: 1, max: 6 },
  rent: { type: Number, required: true, min: 1 }
}, { timestamps: true });
const residentSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 80 },
  gender: { type: String, enum: ['Male', 'Female'], required: true },
  passwordHash: { type: String, select: false },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: '' },
  course: { type: String, required: true, maxlength: 80 },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  bed: { type: Number, required: true },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });
residentSchema.index({ room: 1, bed: 1 }, { unique: true });
const paymentSchema = new mongoose.Schema({
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
  month: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  method: { type: String, enum: ['Bank transfer', 'Cash', 'Card'], required: true },
  paidAt: { type: Date, default: Date.now }
}, { timestamps: true });
paymentSchema.index({ resident: 1, month: 1 }, { unique: true });
export const Room = mongoose.model('Room', roomSchema);
export const Resident = mongoose.model('Resident', residentSchema);
export const Payment = mongoose.model('Payment', paymentSchema);

const wardenSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });
const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, enum: ['warden', 'student'], required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
});
const requestSchema = new mongoose.Schema({
  resident: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident', required: true },
  title: { type: String, required: true, maxlength: 80 },
  message: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['Open', 'In progress', 'Resolved'], default: 'Open' }
}, { timestamps: true });
export const Warden = mongoose.model('Warden', wardenSchema);
export const Session = mongoose.model('Session', sessionSchema);
export const ServiceRequest = mongoose.model('ServiceRequest', requestSchema);
