import mongoose, { type ClientSession } from "mongoose";

/**
 * Cached Mongoose connection.
 *
 * In development, Next.js hot-reloads modules, which would open a new
 * connection on every file save. We keep the connection on `globalThis`
 * so it survives reloads and is reused across requests.
 */

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as unknown as {
  _mongoose?: MongooseCache;
};

const cache: MongooseCache =
  globalForMongoose._mongoose ?? (globalForMongoose._mongoose = { conn: null, promise: null });

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to .env.local (see .env.example).");
  }

  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null; // allow a retry on the next request
    throw err;
  }

  return cache.conn;
}

/**
 * Runs `fn` inside a multi-document ACID transaction, so a multi-step change
 * (e.g. approve leave + deduct the balance) either fully happens or not at all.
 * Both `npm run db` and Atlas are replica sets, so transactions are available.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const conn = await connectDB();
  return conn.connection.transaction((session) => fn(session));
}
