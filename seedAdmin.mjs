import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema({
  fullName: String,
  role: { type: String, default: 'user' },
  email: { type: String, lowercase: true },
  mobileNumber: String,
  password: { type: String, select: false },
  accountNumber: String,
  isVerified: { type: Boolean, default: false },
  isCardLocked: { type: Boolean, default: false },
  balanceUsd: { type: Number, default: 0 },
  btcHolding: { type: Number, default: 0 },
  cardNumber: { type: String, default: '' },
  expiryDate: { type: String, default: '' },
  cardType: { type: String, default: 'Platinum' },
  spendLimit: { type: String, default: ',500' },
  rewards: { type: String, default: '0 pts' },
}, { timestamps: true });

const User = mongoose.model('User', userSchema, 'users');

async function createAdmin() {
  await mongoose.connect(MONGO_URI);

  const email = 'admin@shugharcu.com';
  const password = 'Admin@123456';

  const existing = await User.findOne({ email });
  if (existing) {
    await User.updateOne({ email }, { role: 'admin', isVerified: true });
    console.log('Admin account already exists - updated role to admin.');
    await mongoose.disconnect();
    return;
  }

  const salt = await bcrypt.genSalt(12);
  const hashed = await bcrypt.hash(password, salt);
  const accNum = Math.floor(1000000000 + Math.random() * 8999999999).toString();

  await User.create({
    fullName: 'Admin',
    role: 'admin',
    email,
    password: hashed,
    accountNumber: accNum,
    isVerified: true,
    mobileNumber: '+1000000000',
  });

  console.log('Admin account created!');
  console.log('Email: ' + email);
  console.log('Password: ' + password);
  await mongoose.disconnect();
}

createAdmin().catch(console.error);
