/**
 * Employee records against the real (seeded) database: what each role gets
 * back from the service layer. Needs `npm run db` running and `npm run seed`.
 *
 *   npm run test:db
 *
 * It moves one person in the org chart and moves them back, and adds a few
 * audit entries; run `npm run seed` afterwards for a clean demo.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { ctxForUser, type Ctx } from "@/server/context";
import { createEmployee, getEmployee, listEmployees, revealPii, updateDirectory } from "@/server/services/employees";
import { ForbiddenError, AppError } from "@/server/errors";

const as = async (email: string): Promise<Ctx> => {
  const u = await User.findOne({ email }).lean();
  assert.ok(u, `seeded user ${email} exists (did you run npm run seed?)`);
  return ctxForUser(u, "test");
};
const idOf = async (first: string) => String((await Employee.findOne({ firstName: first }).select("_id").lean())!._id);

before(connectDB);
after(() => mongoose.disconnect());

test("line manager sees his department/team, not other departments", async () => {
  const david = await as("david.kiprop@kilele.co.ke");
  const names = (await listEmployees(david)).map((e) => e.firstName);
  for (const n of ["Collins", "Mercy", "Ian", "Naomi", "Brian"]) assert.ok(names.includes(n), `${n} visible`);
  for (const n of ["Grace", "Esther", "Lucy"]) assert.ok(!names.includes(n), `${n} hidden`);
});

test("field classes: manager gets contact but not PII or pay of his report", async () => {
  const { view } = await getEmployee(await as("david.kiprop@kilele.co.ke"), await idOf("Mercy"));
  assert.ok(view.contact, "contact (team)");
  assert.equal(view.pii, null, "no PII sent");
  assert.equal(view.pay, null, "no pay sent");
});

test("employee sees all of her own record, only directory data of a colleague", async () => {
  const mercy = await as("mercy.njeri@kilele.co.ke");
  const own = (await getEmployee(mercy, await idOf("Mercy"))).view;
  assert.ok(own.contact && own.pii && own.pay, "own record complete");
  assert.match(own.pii!.nationalId, /^••••\d{3}$/, "own PII still masked until revealed");

  const colleague = (await getEmployee(mercy, await idOf("Naomi"))).view;
  assert.equal(colleague.contact, null);
  assert.equal(colleague.pii, null);
  assert.equal(colleague.pay, null);
  await assert.rejects(getEmployee(mercy, await idOf("Grace")), ForbiddenError, "other department is off limits");
});

test("auditor sees everyone's directory data but never PII", async () => {
  const peter = await as("peter.kamau@audit.kilele.co.ke");
  const all = await listEmployees(peter);
  assert.ok(all.length >= 20);
  assert.ok(all.every((e) => e.pii === null && e.pay === null && e.contact === null));
});

test("reveal needs PII access and a reason; National ID search works through the blind index", async () => {
  const grace = await as("grace.wanjiru@kilele.co.ke");
  const mercyId = await idOf("Mercy");
  await assert.rejects(revealPii(grace, mercyId, { reason: "" }), AppError);
  const pii = await revealPii(grace, mercyId, { reason: "Integration test" });
  assert.match(pii.nationalId, /^\d{8}$/);

  const found = await listEmployees(grace, { q: pii.nationalId });
  assert.deepEqual(found.map((e) => e.firstName), ["Mercy"]);

  const david = await as("david.kiprop@kilele.co.ke");
  await assert.rejects(revealPii(david, mercyId, { reason: "Curious about it" }), ForbiddenError);
  assert.equal((await listEmployees(david, { q: pii.nationalId })).length, 0, "no PII access → ID search finds nothing");
});

test("HR Officer can add people but can't set a salary", async () => {
  const kevin = await as("kevin.mutua@kilele.co.ke");
  const eng = String((await Employee.findOne({ firstName: "Mercy" }).lean())!.departmentId);
  const newHire = {
    firstName: "Test", lastName: "Hire", gender: "female", workEmail: "test.hire@kilele.co.ke", jobTitle: "Intern",
    departmentId: eng, employmentType: "intern", status: "probation", grade: "G1", hireDate: "2026-11-02",
    phone: "0712345678", nationalId: "39999999", kraPin: "A000000001Z", nssfNo: "", bankAccount: "", dateOfBirth: "2004-01-01",
  };
  // Fully valid apart from the salary he's not allowed to set: refused before anything is written.
  await assert.rejects(createEmployee(kevin, { ...newHire, basicSalary: "999999" }), ForbiddenError);
  assert.equal(await Employee.exists({ workEmail: "test.hire@kilele.co.ke" }), null);
  const { view } = await getEmployee(kevin, await idOf("Mercy"));
  assert.equal(view.pay, null, "HR Officer never receives salaries");
});

test("changing a manager rewrites the whole subtree's path, and loops are refused", async () => {
  const grace = await as("grace.wanjiru@kilele.co.ke");
  const [ceo, david, collins] = await Promise.all([idOf("Wambui"), idOf("David"), idOf("Collins")]);
  const pathOf = async (first: string) => (await Employee.findOne({ firstName: first }).lean())!.managerPath.map(String);
  const directory = async (id: string) => {
    const e = (await Employee.findById(id).lean())!;
    return {
      firstName: e.firstName, lastName: e.lastName, otherNames: e.otherNames, gender: e.gender, workEmail: e.workEmail,
      jobTitle: e.jobTitle, departmentId: String(e.departmentId), employmentType: e.employmentType, status: e.status,
    };
  };

  // David can't report to Mercy: she's below him.
  await assert.rejects(updateDirectory(grace, david, { ...(await directory(david)), managerId: await idOf("Mercy") }), AppError);

  // Move Collins (and his team) to report straight to the CEO…
  await updateDirectory(grace, collins, { ...(await directory(collins)), managerId: ceo });
  assert.deepEqual(await pathOf("Mercy"), [ceo, collins]);
  // …and back under David.
  await updateDirectory(grace, collins, { ...(await directory(collins)), managerId: david });
  assert.deepEqual(await pathOf("Mercy"), [ceo, david, collins]);
});
