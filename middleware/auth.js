import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export function signTempToken(userId) {
  return jwt.sign({ sub: userId, tfa: true }, process.env.JWT_SECRET, {
    expiresIn: process.env.TEMP_JWT_EXPIRES_IN || '10m',
  });
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Reject temp tokens (issued for OTP flow) from being used as full auth
    if (payload.tfa) {
      return res.status(401).json({ message: 'Token is not a full auth token' });
    }

    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Account is not verified' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export async function adminAuth(req, res, next) {
  // First run requireAuth to get the user, then check if they are an admin
  requireAuth(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ message: 'Admin access required' });
    }
  });
}
