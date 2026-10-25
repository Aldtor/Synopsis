import mongoose from 'mongoose';

let memoryServer = null;

// Reuse the connection across Vercel serverless invocations: a warm
// function instance keeps its mongoose connection, so reconnecting on
// every request would throw / leak connections. If a connection is
// already live (or being established), just use it.
export async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
    console.log('MongoDB connected:', mongoose.connection.host);
    return;
  }
  // On Vercel there is no local MongoDB and mongodb-memory-server is a
  // dev-only dependency, so a missing URI is a configuration error —
  // fail loudly instead of hanging on a binary download.
  if (process.env.VERCEL) {
    throw new Error('MONGODB_URI is not set for the Vercel deployment');
  }
  // Dynamically imported so production (Vercel) bundles never need the
  // dev-only mongodb-memory-server package installed.
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  console.log('In-memory MongoDB started (no MONGODB_URI set — data resets on restart)');
}

export async function closeDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
