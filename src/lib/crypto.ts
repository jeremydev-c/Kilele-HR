import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Field-level encryption for PII (National ID, KRA PIN, bank account...).
 *
 * AES-256-GCM: each value gets a fresh random IV, and the auth tag means a
 * value that was tampered with in the database fails to decrypt instead of
 * silently returning garbage. Stored format: enc:v1:<iv>:<tag>:<ciphertext> (base64).
 *
 * Keys live in the environment, never in the database, so a leaked database
 * dump shows only ciphertext.
 */

function key(envName: "PII_KEY" | "PII_INDEX_KEY"): Buffer {
  const raw = process.env[envName];
  if (raw && raw.length >= 32) return createHash("sha256").update(raw).digest();
  // Dev fallback: derive a separate key per purpose from the session secret.
  const base = process.env.SESSION_SECRET;
  if (!base) throw new Error(`${envName} or SESSION_SECRET must be set (.env.local).`);
  return createHash("sha256").update(`${envName}:${base}`).digest();
}

const PREFIX = "enc:v1:";

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("PII_KEY"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, data].map((b) => b.toString("base64")).join(":");
}

export function decrypt(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // not encrypted (e.g. legacy value)
  const [iv, tag, data] = stored.slice(PREFIX.length).split(":").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key("PII_KEY"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Blind index: a keyed hash of a normalised value. Lets us enforce "no two
 * employees share a National ID" and search by exact ID without decrypting.
 * Keyed (HMAC), so someone with the database can't just hash every possible ID.
 */
export function blindIndex(value: string): string {
  const normalised = value.replace(/\s+/g, "").toUpperCase();
  return createHmac("sha256", key("PII_INDEX_KEY")).update(normalised).digest("hex");
}

/** "12345678" -> "••••5678" */
export function mask(value: string, visible = 4): string {
  if (!value) return "";
  return "••••" + value.slice(-visible);
}
