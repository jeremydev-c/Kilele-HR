/**
 * Emails against the seeded test database: the right message to the right
 * person at each step, links that work, nothing actually sent.
 * Needs `npm run db`. `npm run test:db` seeds kilele_hr_test first.
 */
import "./testDbSetup";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { Email } from "@/server/models/Email";
import { LeaveRequest } from "@/server/models/Leave";
import { Application } from "@/server/models/Recruitment";
import { ctxForUser, type Ctx } from "@/server/context";
import { candidateStatus } from "@/server/services/recruitment";
import { listEmails } from "@/server/services/emails";
import { ForbiddenError } from "@/server/errors";

const as = async (first: string): Promise<Ctx> => {
  const e = await Employee.findOne({ firstName: first }).lean();
  return ctxForUser((await User.findOne({ employeeId: e!._id }).lean())!, "test");
};
const emailOf = async (first: string) => (await User.findOne({ employeeId: (await Employee.findOne({ firstName: first }).lean())!._id }).lean())!.email;

before(() => connectDB());
after(() => mongoose.disconnect());

test("every applicant got a 'we got your application' email, and its link opens their status page", async () => {
  const apps = await Application.find().lean();
  assert.ok(apps.length >= 8);
  for (const a of apps) {
    const m = await Email.findOne({ kind: "application.received", entityId: String(a._id) }).lean();
    assert.ok(m, `email for ${a.candidate.name}`);
    assert.equal(m.to, a.candidate.email);
    assert.equal(m.status, "saved", "the seed never sends");
  }
  const halima = await Application.findOne({ "candidate.name": "Halima Abdi" }).lean();
  const m = (await Email.findOne({ kind: "application.received", entityId: String(halima!._id) }).lean())!;
  const token = m.text.match(/\/careers\/status\/([\w-]+)/)![1];
  assert.equal((await candidateStatus(token)).name, "Halima Abdi", "the emailed link is the real one");
});

test("an interview emails the candidate and each interviewer", async () => {
  const kip = await Application.findOne({ "candidate.name": "Kipchirchir Langat" }).lean();
  const kinds = (await Email.find({ entityId: String(kip!._id) }).lean()).map((e) => e.kind);
  assert.ok(kinds.includes("interview.invite"));
  assert.ok(kinds.includes("interview.panel"));
});

test("approvals reach exactly the people the inbox shows, and the outcome reaches the requester", async () => {
  const daniel = await Employee.findOne({ firstName: "Daniel" }).lean();
  const leave = (await LeaveRequest.findOne({ employeeId: daniel!._id, "workflow.status": "pending" }).lean())!;
  const asked = (await Email.find({ kind: "approval.needed", entityId: String(leave._id) }).lean()).map((e) => e.to);
  assert.ok(asked.includes(await emailOf("Esther")), "his manager, first");
  assert.ok(asked.includes(await emailOf("Grace")), "then HR");
  assert.ok(!asked.includes(await emailOf("Brian")), "the Super Admin isn't copied when HR can decide");
  assert.ok(!asked.includes(await emailOf("Daniel")), "never the person asking");

  // Esther approved her step in the demo story: Daniel heard it moved on to HR.
  const told = await Email.findOne({ kind: "decision.next", entityId: String(leave._id) }).lean();
  assert.equal(told?.to, await emailOf("Daniel"));
  assert.match(told!.html, /Approved by Esther Mwangi, now with HR/);

  // And a fully approved request tells its requester.
  const done = (await LeaveRequest.findOne({ "workflow.status": "approved" }).lean())!;
  const approved = await Email.findOne({ kind: "decision.approved", entityId: String(done._id) }).lean();
  const requester = await User.findById(done.workflow.requestedById).lean();
  assert.equal(approved?.to, requester!.email);
});

test("only people allowed to see emails can open the Emails page", async () => {
  const { emails } = await listEmails(await as("Grace"), {});
  assert.ok(emails.length > 0);
  await assert.rejects(listEmails(await as("David"), {}), ForbiddenError);
  // Peter is an external auditor: an account, no employee record.
  const peter = (await User.findOne({ name: "Peter Kamau" }).lean())!;
  await assert.rejects(listEmails(await ctxForUser(peter, "test"), {}), ForbiddenError, "the auditor can't read pay in offer emails");
});
