import { Types, type QueryFilter } from "mongoose";
import { isScoped, parseGrant, WILDCARD, type Permission, type Scope } from "@/lib/permissions";
import type { Ctx } from "./context";
import { ForbiddenError } from "./errors";

/**
 * Authorisation: the only place that decides "may this person do this?".
 * Pages use it to hide buttons; service functions use it to enforce.
 */

/** The parts of an employee record a scope check needs. */
export type Subject = {
  _id: unknown;
  departmentId: unknown;
  managerPath?: unknown[];
};

/** Holds this permission at any scope (e.g. "show the Leave menu at all?"). */
export function has(ctx: Ctx, perm: Permission): boolean {
  return (ctx.grants.get(perm)?.size ?? 0) > 0;
}

/** Holds this permission at this exact scope, or at "all". */
export function hasScope(ctx: Ctx, perm: Permission, scope: Scope): boolean {
  const scopes = ctx.grants.get(perm);
  return !!scopes && (scopes.has(scope) || scopes.has("all"));
}

function inScope(ctx: Ctx, scope: Scope, subject: Subject): boolean {
  if (scope === "all") return true;
  const me = ctx.employee;
  if (!me) return false; // own/team/department only make sense for a login linked to an employee
  switch (scope) {
    case "own":
      return String(subject._id) === me.id;
    case "team":
      return (subject.managerPath ?? []).some((m) => String(m) === me.id);
    case "department":
      return String(subject.departmentId) === me.departmentId;
  }
}

/** May ctx use `perm` on this particular employee? */
export function can(ctx: Ctx, perm: Permission, subject?: Subject): boolean {
  const scopes = ctx.grants.get(perm);
  if (!scopes?.size) return false;
  if (!isScoped(perm)) return true;
  if (!subject) return scopes.has("all");
  for (const scope of scopes) if (inScope(ctx, scope, subject)) return true;
  return false;
}

export function authorize(ctx: Ctx, perm: Permission, subject?: Subject): void {
  if (!can(ctx, perm, subject)) throw new ForbiddenError();
}

type ScopeFields = { id: string; departmentId: string; managerPath: string };

/**
 * The same grants as a MongoDB filter, so a list query only ever fetches
 * records the user may see (they aren't fetched and then hidden).
 * Returns null when the user can see no one.
 * `fields` maps the filter onto another collection, e.g. leave requests keep
 * a copy of the employee's departmentId and managerPath.
 */
export function scopeFilter(
  ctx: Ctx,
  perm: Permission,
  fields: ScopeFields = { id: "_id", departmentId: "departmentId", managerPath: "managerPath" },
): QueryFilter<unknown> | null {
  const scopes = ctx.grants.get(perm);
  if (!scopes?.size) return null;
  if (scopes.has("all") || !isScoped(perm)) return {};
  const me = ctx.employee;
  if (!me) return null;

  const meId = new Types.ObjectId(me.id);
  const parts: Record<string, unknown>[] = [];
  if (scopes.has("own")) parts.push({ [fields.id]: meId });
  if (scopes.has("team")) parts.push({ [fields.managerPath]: meId });
  if (scopes.has("department")) parts.push({ [fields.departmentId]: new Types.ObjectId(me.departmentId) });
  return parts.length ? { $or: parts } : null;
}

/**
 * No privilege escalation: you may only hand out (in a role or to a user)
 * a grant you hold yourself, at the same scope or at "all".
 */
export function canGrant(ctx: Ctx, grant: string): boolean {
  if (ctx.isSuperAdmin) return true;
  if (grant === WILDCARD) return false;
  const g = parseGrant(grant);
  return !!g && hasScope(ctx, g.perm, g.scope);
}
