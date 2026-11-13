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
    address: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    accountType: {
      type: String,
      default: 'Premium Savings',
      trim: true,
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
    usdtHolding: {
      type: Number,
      default: 2500,
    },
    btcWalletAddress: {
      type: String,
      default: '',
      trim: true,
    },
    usdtWalletAddress: {
      type: String,
      default: '',
      trim: true,
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
    // Admin-controlled Send action state. Keep this in MongoDB so the setting
    // is consistent across browsers and devices.
    sendEnabled: {
      type: Boolean,
      default: true,
    },
    sendMessage: {
      type: String,
      default: '',
      maxlength: 500,
    },
    sendReviewPopupEnabled: {
      type: Boolean,
      default: false,
    },
    sendReviewPopupMessage: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    openPositions: [
      {
        symbol: { type: String, required: true },
        side: { type: String, enum: ['buy', 'sell', 'long', 'short'], default: 'buy' },
        assetType: { type: String, default: 'crypto' },
        amountUsd: { type: Number, required: true },
        entryPrice: { type: Number, required: true },
        cryptoAmount: { type: Number, default: 0 },
        leverage: { type: Number, default: 1 },
        openedAt: { type: Date, default: Date.now },
      },
    ],
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
    address: this.address || '',
    accountType: this.accountType || 'Premium Savings',
    accountNumber: this.accountNumber,
    isCardLocked: this.isCardLocked,
    status: this.status,
    balanceUsd: this.balanceUsd,
    btcHolding: this.btcHolding,
    usdtHolding: this.usdtHolding ?? 2500,
    btcWalletAddress: this.btcWalletAddress || '',
    usdtWalletAddress: this.usdtWalletAddress || '',
    cardNumber: this.cardNumber,
    expiryDate: this.expiryDate,
    cardType: this.cardType,
    spendLimit: this.spendLimit,
    rewards: this.rewards,
    withdrawalMessage: this.withdrawalMessage || '',
    sendEnabled: this.sendEnabled !== false,
    sendMessage: this.sendMessage || '',
    sendReviewPopupEnabled: Boolean(this.sendReviewPopupEnabled),
    sendReviewPopupMessage: this.sendReviewPopupMessage || '',
    openPositions: Array.isArray(this.openPositions)
      ? this.openPositions.map(p => ({
          id: p._id,
          symbol: p.symbol,
          side: p.side,
          assetType: p.assetType,
          amountUsd: p.amountUsd,
          entryPrice: p.entryPrice,
          cryptoAmount: p.cryptoAmount,
          leverage: p.leverage,
          openedAt: p.openedAt,
        }))
      : [],
    createdAt: this.createdAt,
  };
};

export default mongoose.model('User', userSchema);
