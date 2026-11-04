import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { allGrantStrings, WILDCARD } from "@/lib/permissions";
import { Role } from "../models/Role";
import { User } from "../models/User";
import { authorize, canGrant, has } from "../authz";
import { record } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import type { Ctx } from "../context";

export async function listRoles(ctx: Ctx) {
  if (!has(ctx, "role:manage") && !has(ctx, "user:read")) throw new ForbiddenError();
  await connectDB();
  const [roles, counts] = await Promise.all([
    Role.find().sort({ system: -1, name: 1 }).lean(),
    User.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { status: "active" } },
      { $unwind: "$roleIds" },
      { $group: { _id: "$roleIds", n: { $sum: 1 } } },
    ]),
  ]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
  return roles.map((r) => ({
    id: String(r._id),
    name: r.name,
    description: r.description,
    grants: r.grants,
    system: r.system,
    superAdmin: r.grants.includes(WILDCARD),
    users: countOf.get(String(r._id)) ?? 0,
    /** Could this person assign this role to someone? (only if they hold all of its grants) */
    assignable: r.grants.every((g) => canGrant(ctx, g)),
  }));
}

export async function getRole(ctx: Ctx, id: string) {
  authorize(ctx, "role:manage");
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Role");
  await connectDB();
  const role = await Role.findById(id).lean();
  if (!role) throw new NotFoundError("Role");
  const members = await User.find({ roleIds: role._id }).select("name email status").sort({ name: 1 }).lean();
  return {
    id: String(role._id),
    name: role.name,
    description: role.description,
    grants: role.grants,
    system: role.system,
    superAdmin: role.grants.includes(WILDCARD),
    members: members.map((m) => ({ id: String(m._id), name: m.name, email: m.email, status: m.status })),
  };
}

const RoleInput = z.object({
  name: z.string().trim().min(2, "Give the role a name.").max(60),
  description: z.string().trim().max(300).default(""),
  grants: z.array(z.string()).default([]),
});

const VALID_GRANTS = new Set(allGrantStrings());

function checkGrants(ctx: Ctx, grants: string[]) {
  const unknown = grants.filter((g) => !VALID_GRANTS.has(g));
  if (unknown.length) throw new AppError(`Unknown permission: ${unknown.join(", ")}`);
  const notMine = grants.filter((g) => !canGrant(ctx, g));
  if (notMine.length) {
    throw new ForbiddenError(`You can't grant permissions you don't hold yourself: ${notMine.join(", ")}`);
  }
}

export async function createRole(ctx: Ctx, input: unknown) {
  authorize(ctx, "role:manage");
  const data = RoleInput.parse(input);
  const grants = [...new Set(data.grants)];
  checkGrants(ctx, grants);
  await connectDB();
  if (await Role.exists({ name: data.name })) throw new AppError("A role with that name already exists.");
  const role = await Role.create({ ...data, grants });
  await record(ctx, {
    action: "role.create",
    entity: "role",
    entityId: String(role._id),
    summary: `Created role "${data.name}" with ${grants.length} permissions`,
  });
  return String(role._id);
}

export async function updateRole(ctx: Ctx, id: string, input: unknown) {
  authorize(ctx, "role:manage");
  const data = RoleInput.parse(input);
  await connectDB();
  const role = await Role.findById(id);
  if (!role) throw new NotFoundError("Role");
  if (role.grants.includes(WILDCARD)) throw new AppError("The Super Admin role always has every permission and can't be edited.");

  const next = [...new Set(data.grants)];
  const added = next.filter((g) => !role.grants.includes(g));
  const removed = role.grants.filter((g) => !next.includes(g));
  // Adding AND removing both need you to hold the grant: you can't strip
  // access from a role that's above your own level either.
  checkGrants(ctx, [...added, ...removed]);
  if (role.system && data.name !== role.name) throw new AppError("Built-in roles can't be renamed.");
  if (data.name !== role.name && (await Role.exists({ name: data.name, _id: { $ne: id } }))) {
    throw new AppError("A role with that name already exists.");
  }

  const changes = [];
  if (data.name !== role.name) changes.push({ field: "name", from: role.name, to: data.name });
  if (data.description !== role.description) changes.push({ field: "description", from: role.description, to: data.description });
  if (added.length) changes.push({ field: "grants added", to: added.join(", ") });
  if (removed.length) changes.push({ field: "grants removed", from: removed.join(", ") });
  if (!changes.length) return;

  role.name = data.name;
  role.description = data.description;
  role.grants = next;
  await role.save();
  await record(ctx, {
    action: "role.update",
    entity: "role",
    entityId: id,
    summary: `Updated role "${role.name}" (+${added.length} / -${removed.length} permissions)`,
    changes,
  });
}

export async function deleteRole(ctx: Ctx, id: string) {
  authorize(ctx, "role:manage");
  await connectDB();
  const role = await Role.findById(id);
  if (!role) throw new NotFoundError("Role");
  if (role.system) throw new AppError("Built-in roles can't be deleted.");
  checkGrants(ctx, role.grants);
  const holders = await User.countDocuments({ roleIds: role._id });
  if (holders) throw new AppError(`${holders} account(s) still have this role. Remove it from them first.`);
  await role.deleteOne();
  await record(ctx, { action: "role.delete", entity: "role", entityId: id, summary: `Deleted role "${role.name}"` });
}
