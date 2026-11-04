import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { buildGrantMap, WILDCARD, type GrantMap } from "@/lib/permissions";
import { User } from "./models/User";
import { Role } from "./models/Role";
import { Employee } from "./models/Employee";

/**
 * Ctx: who is acting. Every service function takes one, so permission checks
 * and the audit trail always know the actor. Built fresh on each request from
 * the database; the cookie only says which user it is.
 */
export type Ctx = {
  userId: string;
  name: string;
  email: string;
  /** The employee record behind this login, used for "own", "team" and "department" scopes. */
  employee: { id: string; departmentId: string; managerPath: string[] } | null;
  grants: GrantMap;
  roleNames: string[];
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  ip: string | null;
};

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
}

/** The signed-in user's context, or null. Cached for the rest of this request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;

  await connectDB();
  const user = await User.findById(session.sub).lean();
  // A disabled account, or a "sign out everywhere", invalidates old cookies at once.
  if (!user || user.status !== "active" || user.sessionVersion !== session.sv) return null;

  const [roles, employee] = await Promise.all([
    Role.find({ _id: { $in: user.roleIds } }).lean(),
    user.employeeId ? Employee.findById(user.employeeId).select("departmentId managerPath status").lean() : null,
  ]);
  const grantStrings = [...roles.flatMap((r) => r.grants), ...user.extraGrants];

  return {
    userId: String(user._id),
    name: user.name,
    email: user.email,
    employee:
      employee && employee.status !== "separated"
        ? {
            id: String(employee._id),
            departmentId: String(employee.departmentId),
            managerPath: employee.managerPath.map(String),
          }
        : null,
    grants: buildGrantMap(grantStrings),
    roleNames: roles.map((r) => r.name),
    isSuperAdmin: grantStrings.includes(WILDCARD),
    mustChangePassword: user.mustChangePassword,
    ip: await clientIp(),
  };
});

/** For pages and actions that need a signed-in user. */
export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return ctx;
}
