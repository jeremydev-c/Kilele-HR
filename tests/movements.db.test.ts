/**
 * Promotions and exits against the seeded database (seed with `npm run seed:test`,
 * which pins the demo to the week of 4 Nov 2026). Changes data: re-seed afterwards.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { EmploymentEvent } from "@/server/models/EmploymentEvent";
import { Movement } from "@/server/models/Movement";
import { Separation } from "@/server/models/Separation";
import { ctxForUser, type Ctx } from "@/server/context";
import { decide } from "@/server/services/approvals";
import { proposeMovement, salaryForMove } from "@/server/services/movements";
import { getSeparation, signClearance, startSeparation } from "@/server/services/separations";
import { runDueJobs } from "@/server/jobs";
import { AppError, ForbiddenError } from "@/server/errors";

const NOW = new Date("2026-11-04T09:00:00+03:00");
const as = async (first: string): Promise<Ctx> => {
  const e = await Employee.findOne({ firstName: first }).lean();
  return ctxForUser((await User.findOne({ employeeId: e!._id }).lean())!, "test");
};
const empId = async (first: string) => String((await Employee.findOne({ firstName: first }).lean())!._id);
const approve = { decision: "approve" };

before(connectDB);
after(() => mongoose.disconnect());

test("pay moves into the new band: never a cut on promotion, capped on demotion", () => {
  assert.equal(salaryForMove(145_000, "G5", "promotion"), 170_000, "up to the new minimum");
  assert.equal(salaryForMove(200_000, "G5", "promotion"), 200_000, "already inside: unchanged");
  assert.equal(salaryForMove(300_000, "G5", "demotion"), 250_000, "capped at the new maximum");
});

test("promotion routing skips the proposer, and one person can't approve both steps", async () => {
  const mv = (await Movement.findOne({ employeeName: "Mercy Njeri" }).lean())!;
  assert.equal(mv.workflow.steps[0].assigneeName, "David Kiprop", "Collins proposed it, so it goes to his boss");
  const id = String(mv._id);
  await assert.rejects(decide(await as("Collins"), "promotion", id, approve, NOW), AppError, "proposer can't approve");
  assert.equal(await decide(await as("David"), "promotion", id, approve, NOW), "pending");
  // David holds no promotion:approve@all, and Kevin (HR Officer) doesn't either.
  await assert.rejects(decide(await as("Kevin"), "promotion", id, approve, NOW), AppError);
  assert.equal(await decide(await as("Grace"), "promotion", id, approve, NOW), "approved");

  // Effective date has come, so it applied straight away, with a career event.
  const mercy = (await Employee.findById(mv.employeeId).lean())!;
  assert.equal(mercy.grade, "G5");
  assert.equal(mercy.jobTitle, "Senior Software Engineer");
  assert.equal(mercy.pay?.basicSalary, 170_000);
  assert.ok(await EmploymentEvent.exists({ employeeId: mercy._id, requestId: mv._id, type: "promotion" }));
});

test("future-dated promotion waits for its day, then the scheduled job applies it exactly once", async () => {
  const mv = (await Movement.findOne({ employeeName: "Victor Ochieng" }).lean())!;
  assert.equal(mv.appliedAt, null);
  assert.equal((await runDueJobs(NOW)).movements, 0, "not yet");
  const day = new Date(`${mv.effectiveDate}T08:00:00+03:00`);
  const [a, b] = await Promise.all([runDueJobs(day), runDueJobs(day)]);
  assert.equal(a.movements + b.movements, 1, "two job runs at once still apply it only once");
  assert.equal((await Employee.findById(mv.employeeId).lean())!.grade, "G4");
});

test("proposal rules", async () => {
  const david = await as("David");
  await assert.rejects(
    proposeMovement(david, { employeeId: await empId("Grace"), jobTitle: "HR Director", grade: "G7", effectiveDate: "2026-12-01", justification: "Outside my team, so this must be refused straight away." }, NOW),
    ForbiddenError,
  );
  await assert.rejects(
    proposeMovement(david, { employeeId: await empId("Brian"), jobTitle: "IT Lead", grade: "G4", effectiveDate: "2026-12-01", justification: "Same grade isn't a promotion, it's an edit to the profile." }, NOW),
    /same grade/,
  );
  await assert.rejects(
    proposeMovement(david, { employeeId: await empId("Brian"), jobTitle: "IT Lead", grade: "G5", basicSalary: "200000", effectiveDate: "2026-12-01", justification: "Line managers can't see pay, so they can't set a figure." }, NOW),
    ForbiddenError,
  );
});

test("exits: clearance by the right department only; the last sign-off closes the record and the login", async () => {
  const s = (await Separation.findOne({ employeeName: "Patrick Mwenda" }).lean())!;
  const id = String(s._id);
  const item = s.clearance.find((c) => !c.signedAt)!;
  assert.equal(item.item, "Email and system access switched off");
  await assert.rejects(signClearance(await as("Joseph"), id, String(item._id), "", NOW), ForbiddenError, "Operations can't sign IT's item");

  // Exit-interview answers: HR sees them, the line manager doesn't.
  const answers = async (who: string) => ((await getSeparation(await as(who), id, NOW)).sep.exitInterview as { comments?: string } | null)?.comments;
  assert.ok(await answers("Grace"));
  assert.equal(await answers("Joseph"), undefined);

  assert.equal(await signClearance(await as("Brian"), id, String(item._id), "Laptop wiped, accounts closed", NOW), true);
  const patrick = (await Employee.findById(s.employeeId).lean())!;
  assert.equal(patrick.status, "separated");
  const login = (await User.findOne({ employeeId: s.employeeId }).lean())!;
  assert.equal(login.status, "disabled");
});

test("exit rules: employees can only resign; one exit at a time", async () => {
  const mercy = await as("Mercy");
  await assert.rejects(
    startSeparation(mercy, { employeeId: await empId("Mercy"), kind: "termination", lastDay: "2026-12-31", reason: "Trying to terminate myself is not allowed." }, NOW),
    /You can resign/,
  );
  await assert.rejects(
    startSeparation(mercy, { employeeId: await empId("Naomi"), kind: "resignation", lastDay: "2026-12-31", reason: "Resigning for a colleague." }, NOW),
    ForbiddenError,
  );
  await assert.rejects(
    startSeparation(await as("Grace"), { employeeId: await empId("Winnie"), kind: "resignation", lastDay: "2026-12-31", reason: "A second exit for the same person." }, NOW),
    /already an exit/,
  );
});
