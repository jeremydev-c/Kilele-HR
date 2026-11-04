import { randomInt } from "node:crypto";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { WILDCARD } from "@/lib/permissions";
import { User } from "../models/User";
import { Role } from "../models/Role";
import { Employee } from "../models/Employee";
import { authorize, canGrant } from "../authz";
import { record } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import type { Ctx } from "../context";

/** 12 characters, no look-alikes (0/O, 1/l/I), always with letters and digits. */
function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < 12) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function grantsOf(roleIds: unknown[], extra: string[] = []): Promise<string[]> {
  const roles = await Role.find({ _id: { $in: roleIds } }).select("grants").lean();
  return [...roles.flatMap((r) => r.grants), ...extra];
}

/**
 * You may only manage an account whose access you could have granted
 * yourself. This one rule stops an HR Manager from disabling, resetting or
 * re-roling a Super Admin, and stops anyone escalating through someone else.
 */
async function assertCanManage(ctx: Ctx, target: { roleIds: unknown[]; extraGrants: string[] }) {
  const grants = await grantsOf(target.roleIds, target.extraGrants);
  if (!grants.every((g) => canGrant(ctx, g))) {
    throw new ForbiddenError("This account has more access than you do, so you can't change it.");
  }
}

async function superAdminRoleIds(): Promise<Types.ObjectId[]> {
  const roles = await Role.find({ grants: WILDCARD }).select("_id").lean();
  return roles.map((r) => r._id as Types.ObjectId);
}

/** Never leave the system without an active Super Admin. */
async function assertNotLastSuperAdmin(userId: string) {
  const ids = await superAdminRoleIds();
  const target = await User.findById(userId).select("roleIds status").lean();
  if (!target || !target.roleIds.some((r) => ids.some((id) => id.equals(r)))) return;
  const others = await User.countDocuments({ _id: { $ne: userId }, status: "active", roleIds: { $in: ids } });
  if (others === 0) throw new AppError("This is the last active Super Admin. Make someone else Super Admin first.");
}

export async function listUsers(ctx: Ctx, q = "") {
  authorize(ctx, "user:read");
  await connectDB();
  const filter = q
    ? { $or: [{ name: { $regex: escapeRegex(q), $options: "i" } }, { email: { $regex: escapeRegex(q), $options: "i" } }] }
    : {};
  const [users, roles] = await Promise.all([
    User.find(filter).sort({ name: 1 }).limit(200).lean(),
    Role.find().select("name").lean(),
  ]);
  const roleName = new Map(roles.map((r) => [String(r._id), r.name]));
  const now = new Date();
  return users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    roles: u.roleIds.map((id) => roleName.get(String(id)) ?? "?"),
    status: u.status,
    locked: !!u.lockedUntil && u.lockedUntil > now,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
  }));
}

export async function getUser(ctx: Ctx, id: string) {
  authorize(ctx, "user:read");
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("User");
  await connectDB();
  const user = await User.findById(id).lean();
  if (!user) throw new NotFoundError("User");
  const [roles, employee] = await Promise.all([
    Role.find({ _id: { $in: user.roleIds } }).lean(),
    user.employeeId ? Employee.findById(user.employeeId).select("firstName lastName staffNo jobTitle").lean() : null,
  ]);
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    status: user.status,
    roleIds: user.roleIds.map(String),
    roles: roles.map((r) => ({ id: String(r._id), name: r.name, grants: r.grants })),
    extraGrants: user.extraGrants,
    employee: employee
      ? { id: String(employee._id), name: `${employee.firstName} ${employee.lastName}`, staffNo: employee.staffNo, jobTitle: employee.jobTitle }
      : null,
    locked: !!user.lockedUntil && user.lockedUntil > new Date(),
    lockedUntil: user.lockedUntil,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

const objectId = z.string().refine((s) => Types.ObjectId.isValid(s), "Invalid id.");

const CreateUserInput = z.object({
  name: z.string().trim().min(2, "Enter the person's name."),
  email: z.email("Enter a valid email address.").transform((s) => s.toLowerCase().trim()),
  roleIds: z.array(objectId).min(1, "Give the account at least one role."),
  employeeId: objectId.optional().or(z.literal("").transform(() => undefined)),
});

/** Returns the one-time temporary password to hand to the new user. */
export async function createUser(ctx: Ctx, input: unknown) {
  authorize(ctx, "user:manage");
  const data = CreateUserInput.parse(input);
  await connectDB();
  await assertCanManage(ctx, { roleIds: data.roleIds, extraGrants: [] });

  if (await User.exists({ email: data.email })) throw new AppError("An account with that email already exists.");
  if (data.employeeId && (await User.exists({ employeeId: data.employeeId }))) {
    throw new AppError("That employee already has an account.");
  }

  const password = temporaryPassword();
  const user = await User.create({
    name: data.name,
    email: data.email,
    passwordHash: await hashPassword(password),
    roleIds: data.roleIds,
    employeeId: data.employeeId ?? null,
    mustChangePassword: true,
  });
  const roleNames = (await Role.find({ _id: { $in: data.roleIds } }).select("name").lean()).map((r) => r.name);
  await record(ctx, {
    action: "user.create",
    entity: "user",
    entityId: String(user._id),
    summary: `Created account for ${data.name} (${data.email})`,
    changes: [{ field: "roles", to: roleNames.join(", ") }],
  });
  return { id: String(user._id), password };
}

export async function setUserRoles(ctx: Ctx, id: string, roleIds: string[]) {
  authorize(ctx, "user:manage");
  if (id === ctx.userId) throw new AppError("You can't change your own roles. Ask another administrator.");
  const ids = z.array(objectId).parse(roleIds);
  await connectDB();
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User");

  await assertCanManage(ctx, user); // the access they have now
  await assertCanManage(ctx, { roleIds: ids, extraGrants: user.extraGrants }); // and the access they'd get
  const superIds = await superAdminRoleIds();
  const losesSuper = user.roleIds.some((r) => superIds.some((s) => s.equals(r))) && !ids.some((r) => superIds.some((s) => s.equals(r)));
  if (losesSuper) await assertNotLastSuperAdmin(id);

  const allRoles = await Role.find().select("name").lean();
  const nameOf = (rid: unknown) => allRoles.find((r) => String(r._id) === String(rid))?.name ?? "?";
  const before = user.roleIds.map(nameOf).sort().join(", ");
  user.roleIds = ids.map((r) => new Types.ObjectId(r)) as typeof user.roleIds;
  await user.save();
  const after = ids.map(nameOf).sort().join(", ");
  await record(ctx, {
    action: "user.roles",
    entity: "user",
    entityId: id,
    summary: `Changed roles of ${user.name}`,
    changes: [{ field: "roles", from: before || "(none)", to: after || "(none)" }],
  });
}

export async function setUserStatus(ctx: Ctx, id: string, status: "active" | "disabled") {
  authorize(ctx, "user:manage");
  if (id === ctx.userId) throw new AppError("You can't disable your own account.");
  await connectDB();
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User");
  await assertCanManage(ctx, user);
  if (status === "disabled") await assertNotLastSuperAdmin(id);

  const before = user.status;
  user.status = status;
  if (status === "disabled") user.sessionVersion += 1; // signs them out immediately
  await user.save();
  await record(ctx, {
    action: status === "disabled" ? "user.disable" : "user.enable",
    entity: "user",
    entityId: id,
    summary: `${status === "disabled" ? "Disabled" : "Re-enabled"} the account of ${user.name}`,
    changes: [{ field: "status", from: before, to: status }],
  });
}

export async function unlockUser(ctx: Ctx, id: string) {
  authorize(ctx, "user:manage");
  await connectDB();
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User");
  await assertCanManage(ctx, user);
  user.lockedUntil = null;
  user.failedLogins = 0;
  await user.save();
  await record(ctx, { action: "user.unlock", entity: "user", entityId: id, summary: `Unlocked the account of ${user.name}` });
}

/** Returns a new one-time temporary password. Signs the user out everywhere. */
export async function resetPassword(ctx: Ctx, id: string) {
  authorize(ctx, "user:manage");
  if (id === ctx.userId) throw new AppError("Use 'Change password' for your own account.");
  await connectDB();
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User");
  await assertCanManage(ctx, user);

  const password = temporaryPassword();
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = true;
  user.sessionVersion += 1;
  user.lockedUntil = null;
  user.failedLogins = 0;
  await user.save();
  await record(ctx, { action: "user.password_reset", entity: "user", entityId: id, summary: `Reset the password of ${user.name}` });
  return password;
}

export async function revokeSessions(ctx: Ctx, id: string) {
  authorize(ctx, "user:manage");
  await connectDB();
  const user = await User.findById(id);
  if (!user) throw new NotFoundError("User");
  await assertCanManage(ctx, user);
  user.sessionVersion += 1;
  await user.save();
  await record(ctx, { action: "user.sessions_revoked", entity: "user", entityId: id, summary: `Signed ${user.name} out of every device` });
}

/** Current employees who don't have a login yet (for linking a new account). */
export async function listUnlinkedEmployees(ctx: Ctx) {
  authorize(ctx, "user:manage");
  await connectDB();
  const linked = await User.distinct("employeeId", { employeeId: { $ne: null } });
  const employees = await Employee.find({ _id: { $nin: linked }, status: { $ne: "separated" } })
    .select("firstName lastName staffNo workEmail")
    .sort({ firstName: 1 })
    .lean();
  return employees.map((e) => ({
    id: String(e._id),
    label: `${e.firstName} ${e.lastName} (${e.staffNo})`,
    name: `${e.firstName} ${e.lastName}`,
    email: e.workEmail,
  }));
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
