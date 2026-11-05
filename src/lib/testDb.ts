/**
 * Points MONGODB_URI at a separate "<name>_test" database on the same server,
 * so `npm run test:db` and `npm run seed:test` never wipe the demo data
 * someone is clicking through. Call it before the first connectDB().
 */
export function testDatabaseUri(uri: string) {
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)\/?([^?]*)(\?.*)?$/);
  if (!m) throw new Error("MONGODB_URI doesn't look like a MongoDB connection string.");
  const [, host, name, query = ""] = m;
  const db = name || "kilele_hr";
  return `${host}/${db.endsWith("_test") ? db : `${db}_test`}${query}`;
}

export function switchToTestDatabase() {
  process.env.MONGODB_URI = testDatabaseUri(process.env.MONGODB_URI ?? "");
}
