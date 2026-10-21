import mongoose from 'mongoose';
import dns from 'dns';

let cachedConnection = null;

export async function connectDB() {
  // Reuse existing connection (critical for serverless / Vercel)
  if (cachedConnection) {
    return cachedConnection;
  }

  // If mongoose is already connected, cache and return
  if (mongoose.connection.readyState === 1) {
    cachedConnection = mongoose.connection;
    return cachedConnection;
  }

  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI is not set in your .env file');
    }

    // Force Node to use public DNS servers for Atlas SRV resolution.
    dns.setServers(['8.8.8.8', '1.1.1.1']);

    await mongoose.connect(uri);
    cachedConnection = mongoose.connection;
    console.log('✓ MongoDB connected');
  } catch (err) {
    console.error('✗ MongoDB connection failed:', err.message);
    // Always throw so the caller (middleware or startup) knows the DB is down
    throw err;
  }
}
