import { z } from "zod";
import { connectDB } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { User } from "../models/User";
import { record, type Actor } from "../audit";
import { AppError } from "../errors";
import type { Ctx } from "../context";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

/** Same message for "no such user" and "wrong password": don't reveal which emails exist. */
const BAD_LOGIN = "Email or password is incorrect.";

// A real scrypt hash to check against when the email doesn't exist, so a
// wrong email takes as long as a wrong password (no timing leak either).
let dummyHash: Promise<string> | null = null;

export const LoginInput = z.object({
  email: z.email("Enter a valid email address.").transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1, "Enter your password."),
});

export async function login(input: unknown, ip: string | null) {
  const { email, password } = LoginInput.parse(input);
  await connectDB();
  const user = await User.findOne({ email });
  const actor: Actor = { id: user ? String(user._id) : null, name: user?.name ?? email, ip };

  if (!user) {
    await verifyPassword(password, await (dummyHash ??= hashPassword("not-a-real-password")));
    await record(actor, { action: "auth.login_failed", summary: `Failed sign-in for unknown email ${email}` });
    throw new AppError(BAD_LOGIN);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await record(actor, { action: "auth.login_blocked", entity: "user", entityId: String(user._id), summary: "Sign-in attempt while account locked" });
    throw new AppError(`Too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-KE", { timeStyle: "short" })}.`);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    user.failedLogins += 1;
    const locked = user.failedLogins >= MAX_FAILED_LOGINS;
    if (locked) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLogins = 0;
    }
    await user.save();
    await record(actor, {
      action: locked ? "auth.locked" : "auth.login_failed",
      entity: "user",
      entityId: String(user._id),
      summary: locked ? `Account locked for ${LOCK_MINUTES} minutes after ${MAX_FAILED_LOGINS} failed sign-ins` : "Failed sign-in (wrong password)",
    });
    throw new AppError(locked ? `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` : BAD_LOGIN);
  }
  if (user.status !== "active") {
    await record(actor, { action: "auth.login_blocked", entity: "user", entityId: String(user._id), summary: "Sign-in attempt on a disabled account" });
    throw new AppError("This account has been disabled. Contact HR.");
  }

  user.failedLogins = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();
  await record(actor, { action: "auth.login", entity: "user", entityId: String(user._id), summary: "Signed in" });
  return { userId: String(user._id), sessionVersion: user.sessionVersion, mustChangePassword: user.mustChangePassword };
}

export const PasswordRules = z
  .string()
  .min(10, "Use at least 10 characters.")
  .regex(/[A-Za-z]/, "Include a letter.")
  .regex(/[0-9]/, "Include a number.");

const ChangePasswordInput = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: PasswordRules,
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Passwords don't match." })
  .refine((v) => v.next !== v.current, { path: ["next"], message: "Choose a different password from the current one." });

/** Returns the new session version: other devices are signed out, this one gets a fresh cookie. */
export async function changePassword(ctx: Ctx, input: unknown): Promise<number> {
  const { current, next } = ChangePasswordInput.parse(input);
  const user = await User.findById(ctx.userId);
  if (!user) throw new AppError("Account not found.");
  if (!(await verifyPassword(current, user.passwordHash))) throw new AppError("Current password is incorrect.");

  user.passwordHash = await hashPassword(next);
  user.mustChangePassword = false;
  user.sessionVersion += 1;
  await user.save();
  await record(ctx, { action: "auth.password_changed", entity: "user", entityId: ctx.userId, summary: "Changed own password" });
  return user.sessionVersion;
}

export async function logout(ctx: Ctx) {
  await record(ctx, { action: "auth.logout", entity: "user", entityId: ctx.userId, summary: "Signed out" });
}
