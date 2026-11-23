/**
 * The audit log shows what each change was before and what it is now, while
 * personal data and pay stay sealed: stored encrypted, then shown in full,
 * masked or hidden depending on who is reading. Runs in kilele_hr_test only.
 *
 *   npm run test:db
 */
import "./testDbSetup";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { AuditLog } from "@/server/models/AuditLog";
import { ctxForUser, type Ctx } from "@/server/context";
import { verifyChain } from "@/server/audit";
import { listAudit } from "@/server/services/auditTrail";
import { revealPii, updateContact, updateDirectory, updatePay, updatePii } from "@/server/services/employees";

const as = async (email: string): Promise<Ctx> => {
  const u = await User.findOne({ email }).lean();
  assert.ok(u, `seeded user ${email} exists (did you run npm run test:db?)`);
  return ctxForUser(u, "test");
};
const mercy = async () => (await Employee.findOne({ firstName: "Mercy" }).lean())!;
/** The newest audit entry with this action about this employee, as `ctx` sees it. */
const latest = async (ctx: Ctx, action: string, id: string) => {
  const { entries } = await listAudit(ctx, { q: action });
  const e = entries.find((x) => x.action === action && x.entityId === id);
  assert.ok(e, `an ${action} entry exists`);
  return e;
};

before(connectDB);
after(() => mongoose.disconnect());

test("employment details: readable field names, before and now, real manager names", async () => {
  const grace = await as("grace.wanjiru@kilele.co.ke");
  const collins = (await Employee.findOne({ firstName: "Collins" }).lean())!;
  const id = String(collins._id);
  const ceo = String((await Employee.findOne({ firstName: "Wambui" }).select("_id").lean())!._id);
  const base = {
    firstName: collins.firstName, lastName: collins.lastName, otherNames: collins.otherNames, gender: collins.gender,
    workEmail: collins.workEmail, departmentId: String(collins.departmentId), employmentType: collins.employmentType, status: collins.status,
  };
  try {
    await updateDirectory(grace, id, { ...base, jobTitle: "Head of Mobile", managerId: ceo });
    const e = await latest(grace, "employee.update", id);
    const title = e.changes.find((c) => c.label === "Job title");
    assert.deepEqual([title?.from, title?.to], [collins.jobTitle, "Head of Mobile"]);
    const manager = e.changes.find((c) => c.label === "Manager");
    assert.match(manager?.from ?? "", /David/, "old manager by name");
    assert.match(manager?.to ?? "", /Wambui/, "new manager by name");
  } finally {
    await updateDirectory(grace, id, { ...base, jobTitle: collins.jobTitle, managerId: String(collins.managerId) });
  }
});

test("contact and pay: sealed in the database, full for HR Manager, masked or hidden for the auditor", async () => {
  const grace = await as("grace.wanjiru@kilele.co.ke");
  const peter = await as("peter.kamau@audit.kilele.co.ke");
  const m = await mercy();
  const id = String(m._id);
  const c = m.contact!;
  const contact = {
    personalEmail: c.personalEmail ?? "", phone: c.phone ?? "", address: c.address ?? "", town: c.town ?? "", county: c.county ?? "",
    kinName: c.nextOfKin?.name ?? "", kinRelationship: c.nextOfKin?.relationship ?? "", kinPhone: c.nextOfKin?.phone ?? "",
    emergencyName: c.emergencyContact?.name ?? "", emergencyRelationship: c.emergencyContact?.relationship ?? "", emergencyPhone: c.emergencyContact?.phone ?? "",
  };
  const salary = m.pay!.basicSalary!;
  const band = GRADES.find((g) => g.code === m.grade)!;
  const raised = salary + 1000 <= band.max ? salary + 1000 : salary - 1000;

  try {
    await updateContact(grace, id, { ...contact, town: "Isiolo" });
    await updatePay(grace, id, { basicSalary: raised, reason: "Annual increment (test)" });

    // Stored encrypted: the plain values are nowhere in the raw entries.
    const raw = await AuditLog.find({ entityId: id, action: { $in: ["employee.contact.update", "employee.pay.update"] } }).sort({ seq: -1 }).limit(2).lean();
    const json = JSON.stringify(raw);
    assert.ok(!json.includes("Isiolo") && !json.includes(String(raised)), "no plain town or salary in the log");

    // HR Manager may read everyone's contact details and pay: sees them in full.
    const town = (await latest(grace, "employee.contact.update", id)).changes.find((x) => x.label === "Town");
    assert.deepEqual([town?.from, town?.to], [contact.town || "(empty)", "Isiolo"]);
    const pay = (await latest(grace, "employee.pay.update", id)).changes[0];
    assert.equal(pay.label, "Basic salary");
    assert.deepEqual([pay.from, pay.to], [`KES ${salary.toLocaleString("en-KE")}`, `KES ${raised.toLocaleString("en-KE")}`]);

    // The auditor can read the log but not personal data or pay.
    const townSeen = (await latest(peter, "employee.contact.update", id)).changes.find((x) => x.label === "Town");
    assert.equal(townSeen?.to, "••••olo", "contact masked for the auditor");
    const paySeen = (await latest(peter, "employee.pay.update", id)).changes[0];
    assert.equal(paySeen.from, null);
    assert.equal(paySeen.to, null);
    assert.match(paySeen.hidden ?? "", /Hidden/);
  } finally {
    await updateContact(grace, id, contact);
    await updatePay(grace, id, { basicSalary: salary, reason: "Undo test increment" });
  }
});

test("IDs and bank details are masked for everyone, even HR Manager", async () => {
  const grace = await as("grace.wanjiru@kilele.co.ke");
  const m = await mercy();
  const id = String(m._id);
  const pii = await revealPii(grace, id, { reason: "Audit log test" });
  const next = { ...pii, bankAccount: pii.bankAccount === "1234509876" ? "1234500000" : "1234509876" };
  try {
    await updatePii(grace, id, next);
    const acc = (await latest(grace, "employee.pii.update", id)).changes.find((x) => x.label === "Account no.");
    assert.equal(acc?.to, "••••" + next.bankAccount.slice(-4));
    assert.equal(acc?.from, pii.bankAccount ? "••••" + pii.bankAccount.slice(-4) : "(empty)");
  } finally {
    await updatePii(grace, id, pii);
  }
});

test("the hash chain still verifies with the new entries", async () => {
  const report = await verifyChain();
  assert.ok(report.ok, report.ok ? "" : report.problem);
});
