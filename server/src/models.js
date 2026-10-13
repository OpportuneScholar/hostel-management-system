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
