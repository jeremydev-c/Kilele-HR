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
import { listEmails, resendEmail } from "@/server/services/emails";
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
  // (Each person also gets a copy at their personal email: look for the work one.)
  const told = await Email.findOne({ kind: "decision.next", entityId: String(leave._id), to: await emailOf("Daniel") }).lean();
  assert.ok(told, "Daniel heard it moved on");
  assert.match(told!.html, /Approved by Esther Mwangi, now with HR/);

  // And a fully approved request tells its requester.
  const done = (await LeaveRequest.findOne({ "workflow.status": "approved" }).lean())!;
  const requester = await User.findById(done.workflow.requestedById).lean();
  const approved = await Email.findOne({ kind: "decision.approved", entityId: String(done._id), to: requester!.email }).lean();
  assert.ok(approved, "the requester heard it was approved");
});

test("only people allowed to see emails can open the Emails page", async () => {
  const { emails } = await listEmails(await as("Grace"), {});
  assert.ok(emails.length > 0);
  await assert.rejects(listEmails(await as("David"), {}), ForbiddenError);
  // Peter is an external auditor: an account, no employee record.
  const peter = (await User.findOne({ name: "Peter Kamau" }).lean())!;
  await assert.rejects(listEmails(await ctxForUser(peter, "test"), {}), ForbiddenError, "the auditor can't read pay in offer emails");
});

test("Send again: once per email, never to demo addresses, HR only", async () => {
  const base = { subject: "Test", html: "<p>Hi</p>", text: "Hi", kind: "test", status: "failed" as const, reason: "Resend said 403" };
  const real = await Email.create({ ...base, to: "someone.real@gmail.com" });
  const demo = await Email.create({ ...base, to: "grace.wanjiru@kilele.co.ke" });
  const grace = await as("Grace");

  // The tests never send (EMAIL_DELIVERY is "off"); here they also control whether a key "exists".
  const saved = { a: process.env.RESEND_API, b: process.env.RESEND_API_KEY };
  delete process.env.RESEND_API;
  delete process.env.RESEND_API_KEY;
  try {
    // No key, no sending: say so rather than pretend.
    await assert.rejects(resendEmail(grace, String(real._id)), /isn't switched on/);
    process.env.RESEND_API = "re_test";
    assert.equal(await resendEmail(grace, String(real._id)), "saved");
    const again = (await Email.findById(real._id).lean())!;
    assert.ok(again.retriedAt, "the original is marked as retried");
    assert.equal(again.retriedByName, "Grace Wanjiru");
    assert.equal(await Email.countDocuments({ to: "someone.real@gmail.com" }), 2, "the new attempt is its own entry");
    await assert.rejects(resendEmail(grace, String(real._id)), /already sent again/);
    await assert.rejects(resendEmail(grace, String(demo._id)), /demo address/);
    await assert.rejects(resendEmail(await as("David"), String(real._id)), ForbiddenError);
  } finally {
    if (saved.a === undefined) delete process.env.RESEND_API; else process.env.RESEND_API = saved.a;
    if (saved.b === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.b;
  }
});

test("staff emails also go to their personal email; applicants get one copy", async () => {
  const esther = (await Employee.findOne({ firstName: "Esther" }).lean())!;
  const daniel = await Employee.findOne({ firstName: "Daniel" }).lean();
  const leave = (await LeaveRequest.findOne({ employeeId: daniel!._id, "workflow.status": "pending" }).lean())!;
  const asked = (await Email.find({ kind: "approval.needed", entityId: String(leave._id) }).lean()).map((e) => e.to);
  assert.ok(asked.includes(esther.workEmail), "her work email");
  assert.ok(asked.includes(esther.contact!.personalEmail!.toLowerCase()), "and her personal email");

  const halima = await Application.findOne({ "candidate.name": "Halima Abdi" }).lean();
  assert.equal(await Email.countDocuments({ kind: "application.received", entityId: String(halima!._id) }), 1, "no duplicate for applicants");
});
