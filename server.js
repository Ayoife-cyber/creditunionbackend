import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import transactionRoutes from './routes/transactions.js';
import User from './models/User.js';

const app = express();

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

console.log('Allowed CORS origins:', allowedOrigins);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    credentials: true,
  })
);
app.use(express.json());

// Ensure DB is connected before handling requests (serverless-safe)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection middleware error:', err);
    res.status(500).json({ message: 'Database connection failed' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'shughar-credit-union-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

// Only start the server when running locally (not on Vercel)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  connectDB()
    .then(async () => {
      // Ensure admin user exists
      try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
          const adminEmail = 'admin@shughar.com';
          const adminPassword = process.env.ADMIN_PASSWORD || 'Onlyforme123';
          const newAdmin = new User({
            fullName: 'System Admin',
            email: adminEmail,
            password: adminPassword,
            role: 'admin',
            isVerified: true
          });
          await newAdmin.save();
          console.log(`✓ Seeded default admin user (${adminEmail})`);
        }
      } catch (err) {
        console.error('✗ Failed to seed admin user:', err);
      }
      
      app.listen(PORT, () => console.log(`✓ Server running on http://localhost:${PORT}`));
    })
    .catch((err) => {
      console.error('✗ Failed to start server:', err);
      process.exit(1);
    });
}

// Export for Vercel serverless
export default app;
