import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { signToken, requireAuth, signTempToken, adminAuth } from '../middleware/auth.js';
import { sendEmail } from '../services/email.js';

const router = Router();


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10,
  message: { message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});


async function prepareOtp(user) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.otpHash = await bcrypt.hash(otp, 12);
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  return otp;
}


async function issueOtp(user) {
  const otp = await prepareOtp(user);
  await user.save();
  return otp;
}

// POST /api/auth/signup   
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword, mobileNumber } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing.isVerified) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    if (mobileNumber) {
      const existingMobile = await User.findOne({ mobileNumber: mobileNumber.trim(), isVerified: true });
      if (existingMobile) {
        return res.status(409).json({ message: 'An account with this mobile number already exists' });
      }
    }

    // Reuse an unverified record for the same email so we donâ€™t stack up
    // duplicate documents if the user retries signup before verifying
    let user = existing; // may be null or an unverified doc
    if (user) {
      user.fullName = fullName;
      user.password = password;
      if (mobileNumber) user.mobileNumber = mobileNumber.trim();
    } else {
      const userObj = { fullName, email, password };
      if (mobileNumber) userObj.mobileNumber = mobileNumber.trim();
      user = new User(userObj);
    }

    // Prepare OTP fields before saving so everything lands in one write
    const otp = await prepareOtp(user);

    // Save triggers the pre-save hook (hashes password, assigns accountNumber)
    await user.save();

    // Send OTP for email verification
    const subject = 'Verify your Shughar Credit Union account';
    const text = `Your Shughar verification OTP is ${otp}. It expires in 10 minutes.`;
    await sendEmail(user.email, subject, text, `<p>${text}</p>`);

    const tempToken = signTempToken(user._id);
    const resp = { requiresVerification: true, message: 'OTP sent to your email', tempToken };
    if (process.env.NODE_ENV !== 'production') resp.otp = otp;
    return res.status(201).json(resp);
  } catch (err) {
    if (err.code === 11000) {
      const field = err.keyValue && err.keyValue.mobileNumber ? 'mobile number' : 'email';
      return res.status(409).json({ message: `An account with this ${field} already exists` });
    }
    if (err.name === 'ValidationError') {
      const firstError = Object.values(err.errors)[0]?.message || 'Invalid input';
      return res.status(400).json({ message: firstError });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// â”€â”€ POST /api/auth/login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/login', authLimiter, async (req, res) => {
  try {
    // Accept either `identifier` (email or phone), or `email` / `mobileNumber` directly
    const { identifier, email, mobileNumber, password } = req.body;
    const id = (identifier || email || mobileNumber || '').toString().trim();

    if (!id || !password) {
      return res.status(400).json({ message: 'Identifier (email or mobile number) and password are required' });
    }

    let query;
    if (id.includes('@')) {
      query = { email: id.toLowerCase() };
    } else {
      query = { mobileNumber: id };
    }

    const user = await User.findOne(query).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Block login for unverified accounts
    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email before logging in' });
    }

    // generate OTP and send via email
    // Bypass OTP for admins
    if (user.role === 'admin') {
      const token = signToken(user._id);
      return res.json({ token, user: user.toPublicJSON() });
    }

    const otp = await issueOtp(user);

    // send OTP via Email (or console fallback)
    const subject = 'Your Shughar OTP';
    const text = `Your Shughar OTP is ${otp}. It expires in 10 minutes.`;
    await sendEmail(user.email, subject, text, `<p>${text}</p>`);

    const tempToken = signTempToken(user._id);
    const resp = { requires2FA: true, message: 'OTP sent', tempToken };
    if (process.env.NODE_ENV !== 'production') resp.otp = otp;
    return res.json(resp);
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});


// â”€â”€ POST /api/auth/verify-otp â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/verify-otp', async (req, res) => {
  try {
    const { tempToken, otp } = req.body;
    const bearer = req.headers.authorization || '';
    const token = tempToken || (bearer.startsWith('Bearer ') ? bearer.slice(7) : null);

    if (!token || !otp) {
      return res.status(400).json({ message: 'Temp token and OTP are required' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired temp token' });
    }

    // Only accept tokens that were issued specifically for the OTP flow
    if (!payload?.tfa) {
      return res.status(401).json({ message: 'Invalid token type' });
    }

    if (!payload?.sub) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    const user = await User.findById(payload.sub).select('+otpHash otpExpires');
    if (!user) return res.status(401).json({ message: 'User not found' });

    if (!user.otpHash || !user.otpExpires || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'OTP expired or not set' });
    }

    const match = await bcrypt.compare(otp, user.otpHash);
    if (!match) return res.status(401).json({ message: 'Invalid OTP' });

    // If this is a signup verification, mark the account as verified
    const isSignupVerification = !user.isVerified;
    const updateFields = { $unset: { otpHash: '', otpExpires: '' } };
    if (isSignupVerification) updateFields.$set = { isVerified: true };
    await User.findByIdAndUpdate(user._id, updateFields);

    const tokenFinal = signToken(user._id);
    return res.json({ token: tokenFinal, user: user.toPublicJSON() });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// â”€â”€ GET /api/auth/me â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Used by the frontend on page load to restore the session from a stored token
router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.user.toPublicJSON() });
});

// â”€â”€ ADMIN ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/auth/users - Admin route to fetch all users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.json(users.map(u => u.toPublicJSON()));
  } catch (err) {
    console.error('Fetch users error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// â”€â”€ PUT /api/auth/users/:email/toggle-card-lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin route to toggle card lock status
router.put('/users/:email/toggle-card-lock', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.isCardLocked = !user.isCardLocked;
    await user.save();
    
    return res.json({ message: 'Card lock status updated', isCardLocked: user.isCardLocked });
  } catch (err) {
    console.error('Toggle card lock error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// PUT /api/auth/users/:email/toggle-send
// Admin route to persist the Send action state for all user devices.
router.put('/users/:email/toggle-send', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Prefer an explicit value from the client to avoid toggle races when an
    // admin panel is open in more than one tab.
    user.sendEnabled = typeof req.body?.sendEnabled === 'boolean'
      ? req.body.sendEnabled
      : !user.sendEnabled;
    await user.save();

    return res.json({
      message: 'Send status updated',
      sendEnabled: user.sendEnabled,
    });
  } catch (err) {
    console.error('Toggle send error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// â”€â”€ PUT /api/auth/users/:email/balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin route to update balance
router.put('/users/:email/balance', adminAuth, async (req, res) => {
  try {
    const { balanceUsd, btcHolding } = req.body;
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (balanceUsd !== undefined) user.balanceUsd = balanceUsd;
    if (btcHolding !== undefined) user.btcHolding = btcHolding;
    
    await user.save();
    return res.json({ message: 'Balance updated', balanceUsd: user.balanceUsd, btcHolding: user.btcHolding });
  } catch (err) {
    console.error('Update balance error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// â”€â”€ PUT /api/auth/users/:email/card-details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Admin route to update card details
router.put('/users/:email/card-details', adminAuth, async (req, res) => {
  try {
    const { cardNumber, expiryDate, cardType, spendLimit, rewards } = req.body;
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (cardNumber !== undefined) user.cardNumber = cardNumber;
    if (expiryDate !== undefined) user.expiryDate = expiryDate;
    if (cardType !== undefined) user.cardType = cardType;
    if (spendLimit !== undefined) user.spendLimit = spendLimit;
    if (rewards !== undefined) user.rewards = rewards;
    
    await user.save();
    return res.json({ 
      message: 'Card details updated', 
      cardNumber: user.cardNumber, 
      expiryDate: user.expiryDate, 
      cardType: user.cardType, 
      spendLimit: user.spendLimit, 
      rewards: user.rewards 
    });
  } catch (err) {
    console.error('Update card details error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// PUT /api/auth/users/:email/send-message
// Admin route to persist the message shown when Send is disabled.
router.put('/users/:email/send-message', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const message = typeof req.body?.sendMessage === 'string'
      ? req.body.sendMessage.trim()
      : '';
    user.sendMessage = message;
    await user.save();

    return res.json({ message: 'Send message updated', sendMessage: user.sendMessage });
  } catch (err) {
    console.error('Update send message error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ── PUT /api/auth/users/:email/withdrawal-message ──
// Admin route to update a user's custom withdrawal modal writeup
router.put('/users/:email/withdrawal-message', adminAuth, async (req, res) => {
  try {
    const { withdrawalMessage } = req.body;
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.withdrawalMessage = withdrawalMessage !== undefined ? withdrawalMessage : '';
    await user.save();
    return res.json({
      message: 'Withdrawal message updated',
      withdrawalMessage: user.withdrawalMessage,
    });
  } catch (err) {
    console.error('Update withdrawal message error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ── PUT /api/auth/users/:email/status ──
// Admin route to toggle user account status
router.put('/users/:email/status', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Toggle between active and inactive
    user.status = user.status === 'inactive' ? 'active' : 'inactive';
    await user.save();

    return res.json({ message: 'Account status updated', status: user.status });
  } catch (err) {
    console.error('Toggle account status error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ── DELETE /api/auth/users/:email ──
// Admin route to permanently delete a user
router.delete('/users/:email', adminAuth, async (req, res) => {
  try {
    const user = await User.findOneAndDelete({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ message: 'User account permanently deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

export default router;
