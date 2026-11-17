// testMongoConnection.js
// Run this file directly with `node testMongoConnection.js` to see detailed connection diagnostics.

import 'dotenv/config';
import mongoose from 'mongoose';

async function testConnection() {
  const uri = process.env.MONGO_URI;
  console.log('Using MONGO_URI:', uri);
  console.log('Public IP (for reference):');
  try {
    const publicIp = await (await import('public-ip')).default.v4();
    console.log('  ', publicIp);
  } catch (_) {}

  try {
    await mongoose.connect(uri, {
      // Add options to get more verbose errors
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    console.log('✅ MongoDB connected successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection error details:');
    console.error(err);
    // Print the underlying cause chain if any
    if (err.cause) console.error('Cause:', err.cause);
    process.exit(1);
  }
}

testConnection();