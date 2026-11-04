/**
 * The permission engine, tested without a database: scopes, wildcard,
 * unknown grants and the no-escalation rule.   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { buildGrantMap, parseGrant } from "@/lib/permissions";
import { can, canGrant, scopeFilter } from "@/server/authz";
import type { Ctx } from "@/server/context";

const id = () => new Types.ObjectId();
const ceo = id(), david = id(), collins = id(), mercy = id(), grace = id();
const ENG = id(), HR = id();

// CEO → David (Head of Eng) → Collins (Team lead) → Mercy;  CEO → Grace (HR)
const people = {
  david: { _id: david, departmentId: ENG, managerPath: [ceo] },
  collins: { _id: collins, departmentId: ENG, managerPath: [ceo, david] },
  mercy: { _id: mercy, departmentId: ENG, managerPath: [ceo, david, collins] },
  grace: { _id: grace, departmentId: HR, managerPath: [ceo] },
};

function ctxFor(who: keyof typeof people | null, grants: string[]): Ctx {
  const p = who ? people[who] : null;
  return {
    userId: "u",
    name: "Test",
    email: "t@example.com",
    employee: p ? { id: String(p._id), departmentId: String(p.departmentId), managerPath: p.managerPath.map(String) } : null,
    grants: buildGrantMap(grants),
    roleNames: [],
    isSuperAdmin: grants.includes("*"),
    mustChangePassword: false,
    ip: null,
  };
}

test("parseGrant accepts catalogue grants and rejects everything else", () => {
  assert.deepEqual(parseGrant("leave:approve@team"), { perm: "leave:approve", scope: "team" });
  assert.deepEqual(parseGrant("user:manage"), { perm: "user:manage", scope: "all" });
  assert.equal(parseGrant("leave:approve"), null, "scoped permission needs a scope");
  assert.equal(parseGrant("user:manage@team"), null, "unscoped permission can't take a scope");
  assert.equal(parseGrant("payroll:steal@all"), null, "unknown permission");
});

test("team scope covers direct AND indirect reports, not peers or self", () => {
  const davidCtx = ctxFor("david", ["leave:approve@team"]);
  assert.ok(can(davidCtx, "leave:approve", people.collins), "direct report");
  assert.ok(can(davidCtx, "leave:approve", people.mercy), "indirect report");
  assert.ok(!can(davidCtx, "leave:approve", people.grace), "other department");
  assert.ok(!can(davidCtx, "leave:approve", people.david), "not himself");
});

test("own and department scopes", () => {
  const mercyCtx = ctxFor("mercy", ["employee:read@department", "employee.pii:read@own"]);
  assert.ok(can(mercyCtx, "employee:read", people.david), "same department");
  assert.ok(!can(mercyCtx, "employee:read", people.grace), "other department");
  assert.ok(can(mercyCtx, "employee.pii:read", people.mercy), "own PII");
  assert.ok(!can(mercyCtx, "employee.pii:read", people.collins), "not her manager's PII");
});

test("a login with no employee record only gets 'all' scopes", () => {
  const auditor = ctxFor(null, ["employee:read@all", "leave:read@team"]);
  assert.ok(can(auditor, "employee:read", people.mercy));
  assert.ok(!can(auditor, "leave:read", people.mercy));
  assert.equal(scopeFilter(auditor, "leave:read"), null);
});

test("scopeFilter turns grants into a MongoDB filter", () => {
  assert.deepEqual(scopeFilter(ctxFor("david", ["employee:read@all"]), "employee:read"), {});
  assert.equal(scopeFilter(ctxFor("david", []), "employee:read"), null);
  const f = scopeFilter(ctxFor("david", ["employee:read@own", "employee:read@team"]), "employee:read") as { $or: object[] };
  assert.deepEqual(f.$or, [{ _id: david }, { managerPath: david }]);
});

test("wildcard gives every permission at every scope", () => {
  const admin = ctxFor(null, ["*"]);
  assert.ok(can(admin, "role:manage"));
  assert.ok(can(admin, "employee.pii:read", people.grace));
});

test("no escalation: you can only grant what you hold", () => {
  const hr = ctxFor("grace", ["employee.pii:read@all", "leave:approve@team"]);
  assert.ok(canGrant(hr, "employee.pii:read@department"), "narrower scope of an 'all' grant");
  assert.ok(canGrant(hr, "leave:approve@team"));
  assert.ok(!canGrant(hr, "leave:approve@all"), "wider than she holds");
  assert.ok(!canGrant(hr, "role:manage"), "doesn't hold it");
  assert.ok(!canGrant(hr, "*"), "only a Super Admin can hand out Super Admin");
  assert.ok(canGrant(ctxFor(null, ["*"]), "*"));
});
