import mongoose from 'mongoose';
import 'dotenv/config';

const MONGO_URI = process.env.MONGO_URI;

async function makeAdmin() {
  await mongoose.connect(MONGO_URI);
  
  const User = mongoose.model('User', new mongoose.Schema({
    email: String,
    role: String,
  }), 'users');

  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node makeAdmin.mjs your@email.com');
    process.exit(1);
  }

  const result = await User.updateOne(
    { email: email.toLowerCase() },
    { $set: { role: 'admin' } }
  );

  if (result.matchedCount === 0) {
    console.log('No user found with email: ' + email);
  } else {
    console.log('Successfully set role=admin for: ' + email);
  }

  await mongoose.disconnect();
}

makeAdmin().catch(console.error);
