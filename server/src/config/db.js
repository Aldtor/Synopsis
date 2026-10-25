import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let memoryServer = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
    console.log('MongoDB connected:', mongoose.connection.host);
    return;
  }
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  console.log('In-memory MongoDB started (no MONGODB_URI set — data resets on restart)');
}

export async function closeDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
