/**
 * A real MongoDB for local development, with nothing to install.
 *
 * Starts a one-node replica set (so multi-document transactions work, like
 * Atlas) on 127.0.0.1:27027 and keeps the data between runs in
 * ~/.kilele-hr/mongo-data. That's outside OneDrive on purpose: a sync client
 * locking live database files can corrupt them. Set MONGO_DATA_DIR to change it.
 *
 * The first run downloads the mongod binary (~70 MB) into the npm cache;
 * after that it works offline, which is handy on demo day.
 *
 *   npm run db        # leave it running in its own terminal
 */
import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const PORT = 27027;
const dbPath = process.env.MONGO_DATA_DIR || path.join(os.homedir(), ".kilele-hr", "mongo-data");

async function main() {
  mkdirSync(dbPath, { recursive: true });
  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: "kilele", count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ port: PORT, dbPath }],
  });
  console.log(`MongoDB ready at mongodb://127.0.0.1:${PORT}/?replicaSet=kilele`);
  console.log(`Data folder: ${dbPath}  (Ctrl+C to stop)`);

  const stop = async () => {
    await replSet.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
