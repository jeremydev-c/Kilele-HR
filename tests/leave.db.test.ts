/**
 * Leave and the approval engine, against the seeded database.
 * Needs `npm run db`. Runs on its own kilele_hr_test database (seeded by `npm run test:db`), so the demo data is never touched.
 *
 *   npm run test:db
 */
import "./testDbSetup";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { LeaveRequest } from "@/server/models/Leave";
import { ctxForUser, type Ctx } from "@/server/context";
import { applyLeave, balancesFor } from "@/server/services/leave";
import { decide, inbox } from "@/server/services/approvals";
import { AppError } from "@/server/errors";
import { ZodError } from "zod";
import type { WorkflowState } from "@/server/workflow";

const NOW = new Date("2026-11-04T09:00:00+03:00");
const as = async (first: string): Promise<Ctx> => {
  const e = await Employee.findOne({ firstName: first }).lean();
  const u = await User.findOne({ employeeId: e!._id }).lean();
  assert.ok(u, `${first} has a login (did you run npm run test:db?)`);
  return ctxForUser(u, "test");
};
const req = async (first: string, status: WorkflowState["status"] = "pending") => {
  const e = await Employee.findOne({ firstName: first }).lean();
  return String((await LeaveRequest.findOne({ employeeId: e!._id, "workflow.status": status }).lean())!._id);
};
const approve = { decision: "approve" };

before(connectDB);
after(() => mongoose.disconnect());

test("inboxes: each request waits only for the right people", async () => {
  const ids = async (first: string) => (await inbox(await as(first))).map((i) => i.title);
  assert.ok((await ids("David")).includes("Brian Otieno: annual leave"), "David: his report's request");
  assert.ok((await ids("Grace")).includes("Daniel Kipchumba: annual leave"), "HR step: Grace");
  assert.ok((await ids("Kevin")).includes("Daniel Kipchumba: annual leave"), "HR step: Kevin too");
  assert.ok(!(await ids("Grace")).some((t) => t.startsWith("Grace")), "never your own request");
  assert.ok((await ids("Wambui")).includes("Grace Wanjiru: annual leave"), "the CEO approves the HR Manager's leave");
});

test("who may NOT decide", async () => {
  const brianReq = await req("Brian");
  await assert.rejects(decide(await as("Brian"), "leave", brianReq, approve, NOW), AppError, "own request, even as Super Admin");
  await assert.rejects(decide(await as("Collins"), "leave", brianReq, approve, NOW), AppError, "not his manager");
  // David holds leave:approve@team: that's the manager step, not the HR step (@all).
  await assert.rejects(decide(await as("David"), "leave", await req("Daniel"), approve, NOW), AppError);
  // The right approver still can't reject without telling the employee why.
  await assert.rejects(decide(await as("David"), "leave", brianReq, { decision: "reject" }, NOW), ZodError, "rejecting needs a reason");
});

test("two approvers clicking at the same moment: exactly one wins", async () => {
  const id = await req("Daniel");
  const results = await Promise.allSettled([
    decide(await as("Grace"), "leave", id, approve, NOW),
    decide(await as("Kevin"), "leave", id, approve, NOW),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const doc = await LeaveRequest.findById(id).lean();
  assert.equal(doc!.workflow.status, "approved");
});

test("manager then HR: approval moves through the steps and the balance follows", async () => {
  const brian = await Employee.findOne({ firstName: "Brian" }).lean();
  const before = (await balancesFor(brian!, 2026)).find((b) => b.code === "ANNUAL")!;
  const id = await req("Brian");

  assert.equal(await decide(await as("David"), "leave", id, approve, NOW), "pending", "now with HR");
  assert.equal(await decide(await as("Kevin"), "leave", id, approve, NOW), "approved");

  const afterBal = (await balancesFor(brian!, 2026)).find((b) => b.code === "ANNUAL")!;
  assert.equal(afterBal.available, before.available, "days were already reserved while pending");
  assert.equal(afterBal.taken, before.taken + 5);
  assert.equal(afterBal.pending, before.pending - 5);
});

test("same person at two steps: approved once, recorded at both", async () => {
  // Kevin reports to Grace, and Grace is also HR: one click covers both steps.
  const id = await applyLeave(await as("Kevin"), { typeCode: "ANNUAL", start: "2026-11-16", end: "2026-11-17" }, NOW);
  assert.equal(await decide(await as("Grace"), "leave", id, approve, NOW), "approved");
  const wf = (await LeaveRequest.findById(id).lean())!.workflow;
  assert.deepEqual(wf.steps.map((s) => [s.status, s.decidedByName]), [["approved", "Grace Wanjiru"], ["approved", "Grace Wanjiru"]]);
});

test("applying: overlaps, balance, eligibility and weekends are checked", async () => {
  const mercy = await as("Mercy");
  // She already has 14–24 Dec pending.
  await assert.rejects(applyLeave(mercy, { typeCode: "ANNUAL", start: "2026-12-22", end: "2026-12-23" }, NOW), /already have/);
  await assert.rejects(applyLeave(mercy, { typeCode: "ANNUAL", start: "2026-11-09", end: "2026-11-30" }, NOW), /days left/);
  await assert.rejects(applyLeave(mercy, { typeCode: "PATERNITY", start: "2026-11-09", end: "2026-11-10" }, NOW), /isn't available/);
  await assert.rejects(applyLeave(mercy, { typeCode: "ANNUAL", start: "2026-11-07", end: "2026-11-08" }, NOW), /weekends or public holidays/);
  await assert.rejects(applyLeave(mercy, { typeCode: "ANNUAL", start: "2026-11-02", end: "2026-11-03" }, NOW), /in the past/);
  await assert.rejects(applyLeave(mercy, { typeCode: "ANNUAL", start: "2026-12-30", end: "2027-01-02" }, NOW), /new year/);
});

test("carry-over and pro-rata entitlement", async () => {
  // Mercy took 13 of 21 days in 2025: 8 left, capped at 5 carried over.
  const mercy = await Employee.findOne({ firstName: "Mercy" }).lean();
  const annual = (await balancesFor(mercy!, 2026)).find((b) => b.code === "ANNUAL")!;
  assert.equal(annual.carriedOver, 5);
  // Ian joined in August 2026: 5 months of 21 days = 8.75, rounded to 9.
  const ian = await Employee.findOne({ firstName: "Ian" }).lean();
  assert.equal((await balancesFor(ian!, 2026)).find((b) => b.code === "ANNUAL")!.entitlement, 9);
});
