/**
 * A small in-memory rate limiter for the public careers forms (no login there).
 * Per server process, which is fine for one server. With several servers
 * behind a load balancer this would move to Redis or MongoDB with a TTL index.
 */
const hits = new Map<string, number[]>();

/** true if this key may proceed: at most `limit` hits per `windowMs`. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear(); // never grow without bound
  return true;
}
