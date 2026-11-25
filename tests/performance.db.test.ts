/**
 * Performance reviews against the seeded 2026 cycle: who can start and see
 * what, ratings kept private until it's time, the steps in order, goals that
 * must add up, and closing a cycle. Runs in kilele_hr_test only.
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
import { AuditLog } from "@/server/models/AuditLog";
import { Review, ReviewCycle } from "@/server/models/Performance";
import { ctxForUser, type Ctx } from "@/server/context";
import { AppError, ForbiddenError } from "@/server/errors";
import {
  acknowledgeReview, closeCycle, getCycle, getReview, performanceTurns, setGoals, startCycle, submitManagerReview, submitSelfReview,
} from "@/server/services/performance";

const NOW = new Date("2026-11-04T09:00:00+03:00");
const as = async (first: string): Promise<Ctx> => {
  const e = await Employee.findOne({ firstName: first }).lean();
  return ctxForUser((await User.findOne({ employeeId: e!._id }).lean())!, "test");
};
const peter = async () => ctxForUser((await User.findOne({ email: "peter.kamau@audit.kilele.co.ke" }).lean())!, "test");
let seeded = "";
const reviewOf = async (first: string, cycleId = seeded) => {
  const e = await Employee.findOne({ firstName: first }).select("_id").lean();
  return String((await Review.findOne({ cycleId, employeeId: e!._id }).lean())!._id);
};
const goals = (weights: number[]) => ({ goals: JSON.stringify(weights.map((w, i) => ({ title: `Goal number ${i + 1}`, measure: "", weight: w }))) });
const ratings = (rs: number[], summary: string) => ({ ...Object.fromEntries(rs.map((r, i) => [`rating_${i}`, String(r)])), summary });

before(async () => {
  await connectDB();
  seeded = String((await ReviewCycle.findOne({ name: "2026 Annual review" }).lean())!._id);
});
after(() => mongoose.disconnect());

test("only HR starts cycles; everyone with a manager gets a review, the rest are listed", async () => {
  await assert.rejects(startCycle(await as("David"), { name: "2027 Mid-year", periodStart: "2027-01-01", periodEnd: "2027-06-30", dueOn: "2027-07-31" }, NOW), ForbiddenError);
  await assert.rejects(startCycle(await as("Grace"), { name: "2026 Annual review", periodStart: "2026-01-01", periodEnd: "2026-12-31", dueOn: "2026-12-31" }, NOW), /already a cycle/);
  await assert.rejects(startCycle(await as("Grace"), { name: "Backwards", periodStart: "2026-06-30", periodEnd: "2026-01-01", dueOn: "2026-12-31" }, NOW), /end after it starts/);

  const id = await startCycle(await as("Grace"), { name: "2026 Q4 check-in", periodStart: "2026-10-01", periodEnd: "2026-12-31", dueOn: "2026-12-20" }, NOW);
  const cycle = (await ReviewCycle.findById(id).lean())!;
  const current = await Employee.countDocuments({ status: { $ne: "separated" } });
  const reviews = await Review.countDocuments({ cycleId: id });
  assert.equal(reviews + cycle.skipped.length, current, "everyone is either reviewed or listed");
  assert.ok(cycle.skipped.some((s) => s.name === "Wambui Kariuki" && /Nobody manages/.test(s.reason!)), "the CEO has no reviewer");
  assert.ok(await AuditLog.exists({ action: "performance.cycle.start", entityId: id }));
});

test("ratings stay private until it's time", async () => {
  // Brian has rated himself; David hasn't reviewed him yet.
  const brian = await reviewOf("Brian");
  const byDavid = await getReview(await as("David"), brian);
  assert.equal(byDavid.role, "reviewer");
  assert.equal(byDavid.review.goals[0].selfRating, 4, "the reviewer reads the submitted self-review");
  assert.equal(byDavid.can.managerReview, true);

  // Faith is still rating herself: her manager sees the goals but not her draft ratings.
  const faith = await reviewOf("Faith");
  const byGrace = await getReview(await as("Grace"), faith);
  assert.ok(byGrace.review.goals.length > 0);
  assert.equal(byGrace.review.goals[0].selfRating, null);

  // Mercy's manager has submitted: now she sees the ratings and the overall.
  const mercy = await getReview(await as("Mercy"), await reviewOf("Mercy"));
  assert.equal(mercy.review.overall, 4.5);
  assert.equal(mercy.can.acknowledge, true);

  // Outsiders: a colleague and the auditor can't open it; the HR Officer (read@all) can.
  await assert.rejects(getReview(await as("Mercy"), brian), ForbiddenError);
  await assert.rejects(getReview(await peter(), brian), ForbiddenError);
  assert.equal((await getReview(await as("Kevin"), brian)).role, "viewer");
});

test("the steps run in order, each by the right person", async () => {
  const naomi = await reviewOf("Naomi");
  const collins = await as("Collins");
  const me = await as("Naomi");
  await assert.rejects(submitSelfReview(collins, naomi, ratings([4, 4, 4], "Not mine to write at all."), NOW), /Only the person being reviewed/);
  await assert.rejects(submitManagerReview(collins, naomi, ratings([4, 4, 4], "Too early: she hasn't rated herself yet."), NOW), /already moved on/);
  await assert.rejects(submitSelfReview(me, naomi, ratings([4, 6, 4], "A summary that is long enough."), NOW), /1 to 5/);

  await submitSelfReview(me, naomi, ratings([4, 3, 4], "A good year: the API work shipped and CI is faster."), NOW);
  await submitManagerReview(collins, naomi, ratings([4, 3, 5], "Naomi delivered steadily all year and took on the CI work without being asked."), NOW);
  assert.equal((await Review.findById(naomi).lean())!.overall, 4, "4×50 + 3×25 + 5×25 = 4.0");

  await assert.rejects(acknowledgeReview(me, naomi, { agree: "no", comment: "" }, NOW), /what you see differently/);
  await acknowledgeReview(me, naomi, { agree: "no", comment: "I think the CI work deserved a 5 as well." }, NOW);
  const done = (await Review.findById(naomi).lean())!;
  assert.equal(done.stage, "done");
  assert.equal(done.acknowledgement!.agreed, false);

  const managerEntry = await AuditLog.findOne({ action: "performance.review.manager", entityId: naomi }).lean();
  assert.ok(managerEntry && !/\d\.\d/.test(managerEntry.summary), "the rating stays out of the audit summary");
  const cycle = await getCycle(await as("Grace"), seeded, NOW);
  assert.ok(cycle.reviews.find((r) => r.employeeName.startsWith("Naomi"))!.disagreed, "HR sees the disagreement");
});

test("goals: 2 to 8, weights adding up to 100", async () => {
  const q4 = String((await ReviewCycle.findOne({ name: "2026 Q4 check-in" }).lean())!._id);
  const collins = await reviewOf("Collins", q4);
  const david = await as("David");
  await assert.rejects(setGoals(david, collins, goals([100]), NOW), /at least 2/);
  await assert.rejects(setGoals(david, collins, goals([60, 30]), NOW), /add up to 100/);
  await assert.rejects(setGoals(await as("Mercy"), collins, goals([60, 40]), NOW), ForbiddenError);
  await setGoals(david, collins, goals([60, 40]), NOW);
  assert.equal((await Review.findById(collins).lean())!.stage, "self");
});

test("managers see their wider team's reviews; HR sees all", async () => {
  const forDavid = await getCycle(await as("David"), seeded, NOW);
  const davidId = (await Employee.findOne({ firstName: "David" }).lean())!._id;
  const team = await Employee.countDocuments({ managerPath: davidId, status: { $ne: "separated" } });
  assert.equal(forDavid.reviews.length, team, "everyone under David, and nobody else");
  assert.equal(forDavid.canClose, false);
  await assert.rejects(getCycle(await as("Mercy"), seeded, NOW), ForbiddenError);
  assert.ok((await getCycle(await as("Grace"), seeded, NOW)).reviews.length > team);
});

test("closing a cycle freezes unfinished reviews", async () => {
  const q4 = String((await ReviewCycle.findOne({ name: "2026 Q4 check-in" }).lean())!._id);
  const before = await performanceTurns(await as("Collins"));
  await assert.rejects(closeCycle(await as("Kevin"), q4, NOW), ForbiddenError, "reading isn't running");
  const frozen = await closeCycle(await as("Grace"), q4, NOW);
  assert.ok(frozen > 0);
  const collins = await reviewOf("Collins", q4);
  assert.equal((await Review.findById(collins).lean())!.closedEarly, true);
  await assert.rejects(submitSelfReview(await as("Collins"), collins, ratings([4, 4], "Too late for this one now."), NOW), AppError);
  assert.ok((await performanceTurns(await as("Collins"))) < before, "nothing left to do in a closed cycle");
  await assert.rejects(closeCycle(await as("Grace"), q4, NOW), /already closed/);
});
