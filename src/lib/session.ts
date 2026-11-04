import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * The login cookie: a signed, short-lived token holding only the user id and
 * their session version. Roles and permissions are NOT in the token; they are
 * reloaded from the database on every request (see server/context.ts), so
 * removing a role or disabling an account takes effect immediately.
 */

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters (.env.local).");
  }
  return new TextEncoder().encode(s);
}

export const SESSION_COOKIE = "hr_session";
export const SESSION_TTL = 8 * 60 * 60; // one working day

export type SessionPayload = JWTPayload & { sub: string; sv: number };

export async function signSession(userId: string, sessionVersion: number): Promise<string> {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(secret());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" && typeof payload.sv === "number" ? (payload as SessionPayload) : null;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
