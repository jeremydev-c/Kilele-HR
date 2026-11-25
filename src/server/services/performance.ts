import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { toISODate } from "@/lib/leaveDays";
import { overallScore, ratingLabel } from "@/lib/ratings";
import { Employee, type EmployeeRecord } from "../models/Employee";
import { Review, ReviewCycle, type CycleDoc, type ReviewDoc, type ReviewStage } from "../models/Performance";
import { authorize, can, has, scopeFilter } from "../authz";
import { record } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import type { Ctx } from "../context";
import { onCycleStarted, onReviewStep } from "../email/notify";

/**
 * Who may do what with a review:
 *   the employee      reads their own; rates themselves; signs it off
 *   the reviewer      their manager when the cycle started: sets goals; rates
 *   performance:read  reads reviews in scope (HR: everyone; a manager: their wider team)
 *   performance:manage starts and closes cycles
 * Ratings stay private until it's time: the employee sees the manager's
 * ratings only once the manager has submitted, and nobody else sees a
 * self-review before the employee submits it.
 */

const today = (now = new Date()) => toISODate(new Date(now.getTime() + 3 * 3_600_000)); // Nairobi
const isoDate = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const ACTIVE = ["probation", "active", "on_leave"] as const;
const ORDER: ReviewStage[] = ["goals", "self", "manager", "acknowledge", "done"];
const past = (stage: string, than: ReviewStage) => ORDER.indexOf(stage as ReviewStage) > ORDER.indexOf(than);

// ---------------------------------------------------------------------------
// Cycles (HR)
// ---------------------------------------------------------------------------

const CycleInput = z
  .object({
    name: z.string().trim().min(4, "Give the cycle a name, e.g. 2026 Annual review.").max(80),
    periodStart: isoDate("Choose when the period starts."),
    periodEnd: isoDate("Choose when the period ends."),
    dueOn: isoDate("Choose a deadline."),
  })
  .refine((c) => c.periodEnd > c.periodStart, { path: ["periodEnd"], message: "The period must end after it starts." });

/**
 * Starts a cycle: one review for every current employee who joined before the
 * period ended and has a manager to review them. Anyone without one is listed
 * for HR instead of silently left out.
 */
export async function startCycle(ctx: Ctx, input: unknown, now = new Date()) {
  authorize(ctx, "performance:manage");
  const data = CycleInput.parse(input);
  if (data.dueOn < today(now)) throw new AppError("The deadline is in the past.");
  await connectDB();
  if (await ReviewCycle.exists({ name: data.name })) throw new AppError("There's already a cycle with that name.");

  const people = await Employee.find({ status: { $in: ACTIVE }, hireDate: { $lte: new Date(`${data.periodEnd}T23:59:59+03:00`) } })
    .select("firstName lastName jobTitle departmentId managerId managerPath")
    .sort({ firstName: 1 })
    .lean<(EmployeeRecord & { _id: Types.ObjectId })[]>();
  const managers = new Map(
    (await Employee.find({ _id: { $in: people.map((p) => p.managerId).filter(Boolean) } }).select("firstName lastName status").lean<(EmployeeRecord & { _id: Types.ObjectId })[]>())
      .map((m) => [String(m._id), m]),
  );

  const cycle = await ReviewCycle.create({ ...data, startedByName: ctx.name, skipped: [] });
  const reviews = [];
  const skipped = [];
  for (const p of people) {
    const name = `${p.firstName} ${p.lastName}`;
    const m = p.managerId ? managers.get(String(p.managerId)) : null;
    if (!m) { skipped.push({ employeeId: p._id, name, reason: "Nobody manages them" }); continue; }
    if (m.status === "separated") { skipped.push({ employeeId: p._id, name, reason: "Their manager has left" }); continue; }
    reviews.push({
      cycleId: cycle._id, cycleName: data.name, dueOn: data.dueOn,
      employeeId: p._id, employeeName: name, jobTitle: p.jobTitle, departmentId: p.departmentId, managerPath: p.managerPath,
      reviewerId: m._id, reviewerName: `${m.firstName} ${m.lastName}`,
      stage: "goals", history: [{ stage: "goals", at: now, byName: ctx.name, note: "Cycle started" }],
    });
  }
  const saved = await Review.insertMany(reviews);
  cycle.skipped = skipped as typeof cycle.skipped;
  await cycle.save();

  await record(ctx, {
    action: "performance.cycle.start",
    entity: "reviewCycle",
    entityId: String(cycle._id),
    summary: `Started "${data.name}" (${data.periodStart} to ${data.periodEnd}, due ${data.dueOn}): ${saved.length} reviews${skipped.length ? `, ${skipped.length} without a reviewer` : ""}`,
  });
  await onCycleStarted(cycle, saved);
  return String(cycle._id);
}

export async function closeCycle(ctx: Ctx, id: string, now = new Date()) {
  authorize(ctx, "performance:manage");
  const cycle = await loadCycle(id);
  if (cycle.status === "closed") throw new AppError("This cycle is already closed.");
  const unfinished = await Review.updateMany({ cycleId: cycle._id, stage: { $ne: "done" } }, { $set: { closedEarly: true } });
  await ReviewCycle.updateOne({ _id: cycle._id }, { status: "closed", closedAt: now, closedByName: ctx.name });
  await record(ctx, {
    action: "performance.cycle.close",
    entity: "reviewCycle",
    entityId: id,
    summary: `Closed "${cycle.name}"${unfinished.modifiedCount ? `: ${unfinished.modifiedCount} review(s) unfinished` : ""}`,
    changes: [{ field: "status", from: "open", to: "closed" }],
  });
  return unfinished.modifiedCount;
}

async function loadCycle(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Review cycle");
  await connectDB();
  const c = await ReviewCycle.findById(id).lean<CycleDoc>();
  if (!c) throw new NotFoundError("Review cycle");
  return c;
}

const REVIEW_SCOPE = { id: "employeeId", departmentId: "departmentId", managerPath: "managerPath" };

/** One cycle: progress, ratings spread and every review this person may see. */
export async function getCycle(ctx: Ctx, id: string, now = new Date()) {
  const filter = has(ctx, "performance:manage") ? {} : scopeFilter(ctx, "performance:read", REVIEW_SCOPE);
  if (!filter) throw new ForbiddenError();
  const cycle = await loadCycle(id);
  const reviews = await Review.find({ cycleId: cycle._id, ...filter }).sort({ employeeName: 1 }).lean<ReviewDoc[]>();
  const overdue = cycle.status === "open" && cycle.dueOn < today(now);
  const byStage = Object.fromEntries(ORDER.map((s) => [s, reviews.filter((r) => r.stage === s).length])) as Record<ReviewStage, number>;
  const rated = reviews.filter((r) => r.overall != null && past(r.stage, "manager"));
  const spread = [1, 2, 3, 4, 5].map((band) => ({ band, label: ratingLabel(band), count: rated.filter((r) => Math.round(r.overall!) === band).length }));
  return {
    cycle,
    reviews: reviews.map((r) => ({
      id: String(r._id), employeeName: r.employeeName, jobTitle: r.jobTitle, reviewerName: r.reviewerName, stage: r.stage as ReviewStage,
      overall: past(r.stage, "manager") ? r.overall : null,
      disagreed: r.acknowledgement?.agreed === false,
      late: overdue && r.stage !== "done",
      closedEarly: r.closedEarly,
    })),
    byStage,
    spread,
    average: rated.length ? Math.round((rated.reduce((s, r) => s + r.overall!, 0) / rated.length) * 10) / 10 : null,
    canClose: has(ctx, "performance:manage") && cycle.status === "open",
    seesAll: has(ctx, "performance:manage") || !!scopeFilter(ctx, "performance:read") && Object.keys(scopeFilter(ctx, "performance:read")!).length === 0,
  };
}

// ---------------------------------------------------------------------------
// The performance page: my reviews, reviews I write, cycles
// ---------------------------------------------------------------------------

export async function performanceHome(ctx: Ctx) {
  await connectDB();
  const me = ctx.employee ? new Types.ObjectId(ctx.employee.id) : null;
  const pick = "cycleId cycleName dueOn employeeName jobTitle reviewerName stage overall closedEarly acknowledgement createdAt";
  const [mine, writing, cycles] = await Promise.all([
    me ? Review.find({ employeeId: me }).select(pick).sort({ createdAt: -1 }).lean<ReviewDoc[]>() : [],
    me ? Review.find({ reviewerId: me }).select(pick).sort({ createdAt: -1, employeeName: 1 }).lean<ReviewDoc[]>() : [],
    has(ctx, "performance:manage") || has(ctx, "performance:read") ? ReviewCycle.find().sort({ createdAt: -1 }).lean<CycleDoc[]>() : [],
  ]);
  const open = new Set(cycles.length ? cycles.filter((c) => c.status === "open").map((c) => String(c._id))
    : (await ReviewCycle.find({ status: "open" }).select("_id").lean()).map((c) => String(c._id)));
  const counts = cycles.length
    ? await Review.aggregate<{ _id: { c: Types.ObjectId; done: boolean }; n: number }>([
        { $match: { cycleId: { $in: cycles.map((c) => c._id) } } },
        { $group: { _id: { c: "$cycleId", done: { $eq: ["$stage", "done"] } }, n: { $sum: 1 } } },
      ])
    : [];
  const row = (r: ReviewDoc, as: "employee" | "reviewer") => ({
    id: String(r._id), cycleName: r.cycleName, dueOn: r.dueOn, employeeName: r.employeeName, jobTitle: r.jobTitle, reviewerName: r.reviewerName,
    stage: r.stage as ReviewStage, open: open.has(String(r.cycleId)) && !r.closedEarly,
    // The employee sees their overall only once it's theirs to read.
    overall: as === "reviewer" || past(r.stage, "manager") ? r.overall : null,
    yourTurn: open.has(String(r.cycleId)) && (as === "employee" ? ["self", "acknowledge"].includes(r.stage) : ["goals", "manager"].includes(r.stage)),
  });
  return {
    mine: mine.map((r) => row(r, "employee")),
    writing: writing.map((r) => row(r, "reviewer")),
    cycles: cycles.map((c) => {
      const total = counts.filter((x) => String(x._id.c) === String(c._id)).reduce((s, x) => s + x.n, 0);
      const done = counts.find((x) => String(x._id.c) === String(c._id) && x._id.done)?.n ?? 0;
      return { id: String(c._id), name: c.name, status: c.status, dueOn: c.dueOn, periodStart: c.periodStart, periodEnd: c.periodEnd, total, done };
    }),
    canStart: has(ctx, "performance:manage"),
  };
}

// ---------------------------------------------------------------------------
// One review
// ---------------------------------------------------------------------------

async function loadReview(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Review");
  await connectDB();
  const r = await Review.findById(id);
  if (!r) throw new NotFoundError("Review");
  const cycle = await ReviewCycle.findById(r.cycleId).select("status").lean();
  return { r, open: cycle?.status === "open" && !r.closedEarly };
}

function roleIn(ctx: Ctx, r: { employeeId: unknown; reviewerId: unknown; departmentId: unknown; managerPath: unknown[] }) {
  const me = ctx.employee?.id;
  if (me && String(r.employeeId) === me) return "employee" as const;
  if (me && String(r.reviewerId) === me) return "reviewer" as const;
  if (has(ctx, "performance:manage") || can(ctx, "performance:read", { _id: r.employeeId, departmentId: r.departmentId, managerPath: r.managerPath })) return "viewer" as const;
  return null;
}

/** The review as this person may see it, and what they can do next. */
export async function getReview(ctx: Ctx, id: string) {
  const { r, open } = await loadReview(id);
  const role = roleIn(ctx, r);
  if (!role) throw new ForbiddenError();
  const stage = r.stage as ReviewStage;
  // Goals: a draft until the manager submits them. Self-review: private to the employee until submitted.
  // Manager's ratings: the employee reads them once the manager submits; viewers likewise.
  const showGoals = role === "reviewer" || past(stage, "goals");
  const showSelf = role === "employee" || past(stage, "self");
  const showManager = role === "reviewer" || past(stage, "manager");
  return {
    role,
    open,
    review: {
      id: String(r._id), cycleName: r.cycleName, dueOn: r.dueOn, employeeId: String(r.employeeId), employeeName: r.employeeName, jobTitle: r.jobTitle,
      reviewerName: r.reviewerName, stage, closedEarly: r.closedEarly,
      goals: showGoals
        ? r.goals.map((g) => ({
            title: g.title, measure: g.measure, weight: g.weight,
            selfRating: showSelf ? g.selfRating : null, selfComment: showSelf ? g.selfComment : "",
            managerRating: showManager ? g.managerRating : null, managerComment: showManager ? g.managerComment : "",
          }))
        : [],
      selfSummary: showSelf ? r.selfSummary : "",
      managerSummary: showManager ? r.managerSummary : "",
      overall: showManager ? r.overall : null,
      acknowledgement: r.acknowledgement ? { agreed: !!r.acknowledgement.agreed, comment: r.acknowledgement.comment ?? "", at: r.acknowledgement.at } : null,
      history: r.history.map((h) => ({ stage: h.stage, at: h.at, byName: h.byName, note: h.note })),
    },
    can: {
      setGoals: open && role === "reviewer" && stage === "goals",
      selfReview: open && role === "employee" && stage === "self",
      managerReview: open && role === "reviewer" && stage === "manager",
      acknowledge: open && role === "employee" && stage === "acknowledge",
    },
  };
}

type Loaded = Awaited<ReturnType<typeof loadReview>>;
async function forStep(ctx: Ctx, id: string, who: "employee" | "reviewer", stage: ReviewStage): Promise<Loaded["r"]> {
  const { r, open } = await loadReview(id);
  const role = roleIn(ctx, r);
  if (!role) throw new ForbiddenError();
  if (role !== who) throw new ForbiddenError(who === "employee" ? "Only the person being reviewed can do this." : `Only ${r.reviewerName}, the reviewer, can do this.`);
  if (!open) throw new AppError("This review cycle is closed.");
  if (r.stage !== stage) throw new AppError("This review has already moved on. Reload the page.");
  return r;
}

const GoalsInput = z.object({
  goals: z.preprocess(
    (v) => (typeof v === "string" ? JSON.parse(v || "[]") : v),
    z
      .array(z.object({
        title: z.string().trim().min(3, "Each goal needs a title.").max(140),
        measure: z.string().trim().max(240).default(""),
        weight: z.coerce.number().int("Weights are whole numbers.").min(5, "Each goal weighs at least 5%.").max(100),
      }))
      .min(2, "Set at least 2 goals.")
      .max(8, "Set at most 8 goals.")
      .refine((g) => g.reduce((s, x) => s + x.weight, 0) === 100, "The weights must add up to 100%."),
  ),
});

export async function setGoals(ctx: Ctx, id: string, input: unknown, now = new Date()) {
  const { goals } = GoalsInput.parse(input);
  const r = await forStep(ctx, id, "reviewer", "goals");
  r.goals = goals as typeof r.goals;
  r.stage = "self";
  r.history.push({ stage: "self", at: now, byName: ctx.name, note: `${goals.length} goals set` });
  await r.save();
  await record(ctx, {
    action: "performance.review.goals",
    entity: "review",
    entityId: id,
    summary: `Set ${goals.length} goals for ${r.employeeName} (${r.cycleName})`,
  });
  await onReviewStep(r, "self");
}

/** rating_0 … rating_n (1–5) and comment_0 … for each goal, plus a summary. */
function ratingsFrom(input: unknown, count: number, minSummary: number) {
  const f = (input ?? {}) as Record<string, unknown>;
  const ratings: number[] = [];
  const comments: string[] = [];
  const fieldErrors: z.core.$ZodIssue[] = [];
  for (let i = 0; i < count; i++) {
    const n = Number(f[`rating_${i}`]);
    if (!Number.isInteger(n) || n < 1 || n > 5) fieldErrors.push({ code: "custom", path: [`rating_${i}`], message: "Choose a rating from 1 to 5.", input: f[`rating_${i}`] });
    ratings.push(n);
    comments.push(String(f[`comment_${i}`] ?? "").trim().slice(0, 1000));
  }
  const summary = String(f.summary ?? "").trim();
  if (summary.length < minSummary) fieldErrors.push({ code: "custom", path: ["summary"], message: `Write a summary (at least ${minSummary} characters).`, input: summary });
  if (summary.length > 3000) fieldErrors.push({ code: "custom", path: ["summary"], message: "Keep the summary under 3,000 characters.", input: summary });
  if (fieldErrors.length) throw new z.ZodError(fieldErrors);
  return { ratings, comments, summary };
}

export async function submitSelfReview(ctx: Ctx, id: string, input: unknown, now = new Date()) {
  const r = await forStep(ctx, id, "employee", "self");
  const { ratings, comments, summary } = ratingsFrom(input, r.goals.length, 20);
  r.goals.forEach((g, i) => { g.selfRating = ratings[i]; g.selfComment = comments[i]; });
  r.selfSummary = summary;
  r.stage = "manager";
  r.history.push({ stage: "manager", at: now, byName: ctx.name, note: "Self-review submitted" });
  await r.save();
  await record(ctx, { action: "performance.review.self", entity: "review", entityId: id, summary: `${r.employeeName} submitted their self-review (${r.cycleName})` });
  await onReviewStep(r, "manager");
}

export async function submitManagerReview(ctx: Ctx, id: string, input: unknown, now = new Date()) {
  const r = await forStep(ctx, id, "reviewer", "manager");
  const { ratings, comments, summary } = ratingsFrom(input, r.goals.length, 40);
  r.goals.forEach((g, i) => { g.managerRating = ratings[i]; g.managerComment = comments[i]; });
  r.managerSummary = summary;
  r.overall = overallScore(r.goals.map((g) => ({ weight: g.weight, rating: g.managerRating })));
  r.stage = "acknowledge";
  r.history.push({ stage: "acknowledge", at: now, byName: ctx.name, note: "Manager review submitted" });
  await r.save();
  // The rating itself stays out of the audit summary: the log is read more widely than reviews are.
  await record(ctx, { action: "performance.review.manager", entity: "review", entityId: id, summary: `Reviewed ${r.employeeName} (${r.cycleName})` });
  await onReviewStep(r, "acknowledge");
}

const AckInput = z
  .object({ agree: z.enum(["yes", "no"], { message: "Say whether you agree." }), comment: z.string().trim().max(2000).default("") })
  .refine((a) => a.agree === "yes" || a.comment.length >= 10, { path: ["comment"], message: "Say what you see differently (at least 10 characters)." });

export async function acknowledgeReview(ctx: Ctx, id: string, input: unknown, now = new Date()) {
  const { agree, comment } = AckInput.parse(input);
  const r = await forStep(ctx, id, "employee", "acknowledge");
  r.acknowledgement = { agreed: agree === "yes", comment, at: now };
  r.stage = "done";
  r.history.push({ stage: "done", at: now, byName: ctx.name, note: agree === "yes" ? "Signed off: agrees" : "Signed off: disagrees" });
  await r.save();
  await record(ctx, {
    action: "performance.review.acknowledge",
    entity: "review",
    entityId: id,
    summary: `${r.employeeName} signed off their review (${r.cycleName})${agree === "yes" ? "" : " and disagreed"}`,
    reason: agree === "no" ? comment : undefined,
  });
}

/** Reviews waiting on this person right now: the badge on the Performance menu item. */
export async function performanceTurns(ctx: Ctx) {
  if (!ctx.employee) return 0;
  await connectDB();
  const me = new Types.ObjectId(ctx.employee.id);
  const live = { closedEarly: false, cycleId: { $in: (await ReviewCycle.find({ status: "open" }).select("_id").lean()).map((c) => c._id) } };
  return Review.countDocuments({
    ...live,
    $or: [{ employeeId: me, stage: { $in: ["self", "acknowledge"] } }, { reviewerId: me, stage: { $in: ["goals", "manager"] } }],
  });
}
