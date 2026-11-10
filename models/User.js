import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: 80,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address'],
    },
    mobileNumber: {
      type: String,
      trim: true,
      maxlength: 20,
      match: [/^[+\d][\d\s-().]{5,}$/, 'Enter a valid mobile number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // never return password by default
    },
    accountNumber: {
      type: String,
      unique: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    isCardLocked: {
      type: Boolean,
      default: false,
    },
    balanceUsd: {
      type: Number,
      default: 0,
    },
    btcHolding: {
      type: Number,
      default: 0,
    },
    cardNumber: {
      type: String,
      default: '',
    },
    expiryDate: {
      type: String,
      default: '',
    },
    cardType: {
      type: String,
      default: 'Platinum',
    },
    spendLimit: {
      type: String,
      default: '$8,500',
    },
    rewards: {
      type: String,
      default: '0 pts',
    },
    withdrawalMessage: {
      type: String,
      default: '',
    },
    otpHash: {
      type: String,
      select: false,
    },
    otpExpires: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Generate a pseudo account number before first save
userSchema.pre('save', async function hashAndAssign(next) {
  if (!this.accountNumber) {
    this.accountNumber = Math.floor(1000000000 + Math.random() * 8999999999).toString();
  }
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Shape returned to the client — never expose the password hash
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    role: this.role,
    fullName: this.fullName,
    email: this.email,
    mobileNumber: this.mobileNumber,
    accountNumber: this.accountNumber,
    isCardLocked: this.isCardLocked,
    status: this.status,
    balanceUsd: this.balanceUsd,
    btcHolding: this.btcHolding,
    cardNumber: this.cardNumber,
    expiryDate: this.expiryDate,
    cardType: this.cardType,
    spendLimit: this.spendLimit,
    rewards: this.rewards,
    withdrawalMessage: this.withdrawalMessage || '',
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
