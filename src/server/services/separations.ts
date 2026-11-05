import { Types } from "mongoose";
import { z } from "zod";
import { connectDB, withTransaction } from "@/lib/db";
import { toISODate } from "@/lib/leaveDays";
import { Employee, type EmployeeRecord } from "../models/Employee";
import { Department } from "../models/Department";
import { EmploymentEvent } from "../models/EmploymentEvent";
import { User } from "../models/User";
import { Separation, type SeparationRecord } from "../models/Separation";
import { nextNumber } from "../models/Counter";
import { authorize, can, has, scopeFilter } from "../authz";
import { record, type Actor } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { cancelWorkflow, decisionRight, startWorkflow, subjectOf, WORKFLOW_SUBJECT_FIELDS, type WorkflowDef } from "../workflow";
import { balancesFor } from "./leave";
import type { Ctx } from "../context";
import { notifyApprovers, onClearanceStarted } from "../email/notify";

type Stored = EmployeeRecord & { _id: Types.ObjectId };
type SepDoc = SeparationRecord & { _id: Types.ObjectId };

export const SEPARATION_WORKFLOW: WorkflowDef = {
  steps: [
    { key: "manager", label: "Line manager", approver: { kind: "manager", perm: "separation:initiate" } },
    { key: "hr", label: "HR", approver: { kind: "permission", perm: "separation:approve", scope: "all" } },
  ],
  distinctApprovers: true,
};

export const KIND_LABELS = {
  resignation: "Resignation",
  retirement: "Retirement",
  termination: "Termination",
  end_of_contract: "End of contract",
} as const;

/** Kenya's Employment Act s.35: 28 days' notice for monthly-paid staff (or pay in lieu). */
export const NOTICE_DAYS = 28;

export const EXIT_TOPICS = ["Support from your manager", "Growth and learning", "Pay and benefits", "Workload", "Culture"] as const;
export const EXIT_REASONS = ["Better pay elsewhere", "Career growth", "Relocation", "Management", "Further studies", "Retirement", "Other"] as const;

/** Who clears what. Each department signs off its own items; HR's certificate of service is required by law (s.51). */
const CLEARANCE_TEMPLATE: { dept: string; item: string }[] = [
  { dept: "ENG", item: "Laptop, phone and accessories returned" },
  { dept: "ENG", item: "Email and system access switched off" },
  { dept: "FIN", item: "Advances, loans and imprest settled" },
  { dept: "FIN", item: "Final dues calculated (pay, leave days owed)" },
  { dept: "HR", item: "ID badge and access card returned" },
  { dept: "HR", item: "Certificate of service issued (Employment Act s.51)" },
];

const today = (now = new Date()) => toISODate(new Date(now.getTime() + 3 * 3_600_000));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

const StartInput = z.object({
  employeeId: z.string().refine((s) => Types.ObjectId.isValid(s), "Pick an employee."),
  kind: z.enum(["resignation", "retirement", "termination", "end_of_contract"]),
  lastDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last working day."),
  reason: z.string().trim().min(10, "Give a short reason (at least 10 characters).").max(2000),
});

export async function startSeparation(ctx: Ctx, input: unknown, now = new Date()) {
  const data = StartInput.parse(input);
  await connectDB();
  const e = await Employee.findById(data.employeeId).lean<Stored>();
  if (!e || e.status === "separated") throw new NotFoundError("Employee");
  authorize(ctx, "separation:initiate", e);

  const self = ctx.employee?.id === data.employeeId;
  if (self && data.kind !== "resignation") throw new AppError("You can resign; other kinds of exit are started by HR or your manager.");
  if (data.kind === "termination" && data.reason.length < 30) {
    throw new AppError("A termination needs a full reason (at least 30 characters): it may be reviewed later.");
  }
  const t = today(now);
  if (data.lastDay < t) throw new AppError("The last day can't be in the past.");
  if (daysBetween(t, data.lastDay) > 400) throw new AppError("The last day is more than a year away.");
  if (await Separation.exists({ employeeId: e._id, "workflow.status": { $in: ["pending", "approved"] }, completedAt: null })) {
    throw new AppError("There's already an exit in progress for this person.");
  }

  const year = now.getUTCFullYear();
  const doc = await withTransaction(async (session) => {
    const number = `SEP-${year}-${String(await nextNumber(`sep-${year}`, session)).padStart(4, "0")}`;
    const workflow = await startWorkflow(SEPARATION_WORKFLOW, e, ctx, now);
    const [s] = await Separation.create(
      [{ number, kind: data.kind, employeeId: e._id, employeeName: `${e.firstName} ${e.lastName}`, departmentId: e.departmentId, lastDay: data.lastDay, reason: data.reason, workflow }],
      { session },
    );
    return s;
  });
  await record(ctx, {
    action: `separation.start`,
    entity: "separation",
    entityId: String(doc._id),
    summary: self
      ? `Resigned, last day ${data.lastDay} (${doc.number})`
      : `Started ${KIND_LABELS[data.kind].toLowerCase()} for ${doc.employeeName}, last day ${data.lastDay} (${doc.number})`,
    reason: data.reason,
  });
  await notifyApprovers("separation", doc._id);
  return String(doc._id);
}

export async function withdrawSeparation(ctx: Ctx, id: string, now = new Date()) {
  const s = await load(id);
  if (ctx.userId !== s.workflow.requestedById) throw new ForbiddenError("Only the person who started this can withdraw it.");
  if (s.workflow.status !== "pending") throw new AppError("It's already been decided. Ask HR.");
  cancelWorkflow(ctx, s.workflow, "Withdrawn", now);
  const res = await Separation.updateOne({ _id: s._id, "workflow.status": "pending" }, { $set: { workflow: s.workflow } });
  if (!res.modifiedCount) throw new AppError("This changed while you were looking. Refresh and try again.");
  await record(ctx, { action: "separation.withdraw", entity: "separation", entityId: id, summary: `Withdrew ${s.number} (${s.employeeName})` });
}

// ---------------------------------------------------------------------------
// After approval: clearance, exit interview, completion
// ---------------------------------------------------------------------------

/** Called when HR gives the final approval: create the clearance checklist. */
export async function startClearance(id: unknown, now = new Date()) {
  await connectDB();
  const s = await Separation.findById(id);
  if (!s || s.workflow.status !== "approved" || s.clearance.length) return;
  const depts = await Department.find().lean();
  const byCode = new Map(depts.map((d) => [d.code, d]));
  const own = depts.find((d) => String(d._id) === String(s.departmentId));
  const items = CLEARANCE_TEMPLATE.flatMap(({ dept, item }) => {
    const d = byCode.get(dept);
    return d ? [{ departmentId: d._id, departmentName: d.name, item }] : [];
  });
  if (own) items.push({ departmentId: own._id, departmentName: own.name, item: "Work and documents handed over" });
  s.clearance.push(...items);
  await s.save();
  await onClearanceStarted(s._id);
  await completeIfDue(s._id, now);
}

/** Clearance is signed by someone in the item's own department who holds clearance:signoff. Never by the leaver. */
function canSign(ctx: Ctx, s: SepDoc, departmentId: unknown) {
  return (
    has(ctx, "clearance:signoff") &&
    !!ctx.employee &&
    ctx.employee.id !== String(s.employeeId) &&
    ctx.employee.departmentId === String(departmentId)
  );
}

export async function signClearance(ctx: Ctx, id: string, itemId: string, note: string, now = new Date()) {
  authorize(ctx, "clearance:signoff");
  const s = await load(id);
  const item = s.clearance.find((c) => String(c._id) === itemId);
  if (!item) throw new NotFoundError("Clearance item");
  if (!canSign(ctx, s, item.departmentId)) throw new ForbiddenError(`Only ${item.departmentName} can sign this off.`);
  const res = await Separation.updateOne(
    { _id: s._id, clearance: { $elemMatch: { _id: item._id, signedAt: null } } },
    { $set: { "clearance.$.signedById": ctx.userId, "clearance.$.signedByName": ctx.name, "clearance.$.signedAt": now, "clearance.$.note": note.trim().slice(0, 300) } },
  );
  if (!res.modifiedCount) throw new AppError("Already signed off.");
  await record(ctx, {
    action: "separation.clearance",
    entity: "separation",
    entityId: id,
    summary: `${item.departmentName} cleared "${item.item}" for ${s.employeeName} (${s.number})`,
  });
  return completeIfDue(s._id, now, { id: ctx.userId, name: ctx.name, ip: ctx.ip });
}

const ExitInput = z.object({
  reason: z.enum(EXIT_REASONS, { message: "Choose the main reason." }),
  wouldRecommend: z.enum(["yes", "no"], { message: "Choose yes or no." }),
  comments: z.string().trim().max(3000).default(""),
});

export async function submitExitInterview(ctx: Ctx, id: string, input: Record<string, unknown>, now = new Date()) {
  const s = await load(id);
  if (ctx.employee?.id !== String(s.employeeId)) throw new ForbiddenError("Only the person leaving fills in their exit interview.");
  if (s.workflow.status !== "approved") throw new AppError("The exit interview opens once your exit is approved.");
  if (s.exitInterview?.submittedAt) throw new AppError("You've already submitted it. Thank you!");
  const data = ExitInput.parse(input);
  const ratings = EXIT_TOPICS.map((topic, i) => {
    const n = Number(input[`rating_${i}`]);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new AppError(`Rate "${topic}" from 1 to 5.`);
    return { topic, score: n };
  });
  await Separation.updateOne(
    { _id: s._id },
    { exitInterview: { reason: data.reason, ratings, wouldRecommend: data.wouldRecommend === "yes", comments: data.comments, submittedAt: now } },
  );
  // The audit trail records THAT it was submitted, never what was said.
  await record(ctx, { action: "separation.exit_interview", entity: "separation", entityId: id, summary: `Submitted their exit interview (${s.number})` });
}

/**
 * Close the employee record once everything is done: approved, every
 * clearance item signed, and the last day reached. Called after each
 * sign-off and by the scheduled job. Safe to call twice (completedAt claim).
 */
export async function completeIfDue(id: unknown, now = new Date(), actor: Actor = { id: null, name: "Scheduler", ip: null }) {
  await connectDB();
  const s = await Separation.findById(id).lean<SepDoc>();
  if (!s || s.completedAt || s.workflow.status !== "approved") return false;
  if (!s.clearance.length || s.clearance.some((c) => !c.signedAt) || s.lastDay > today(now)) return false;

  const done = await withTransaction(async (session) => {
    const claimed = await Separation.updateOne({ _id: s._id, completedAt: null }, { completedAt: now }, { session });
    if (!claimed.modifiedCount) return false;
    const e = await Employee.findById(s.employeeId).session(session).lean<Stored>();
    if (!e) return false;
    await Employee.updateOne({ _id: e._id }, { status: "separated", separationDate: new Date(`${s.lastDay}T00:00:00+03:00`) }, { session });
    await EmploymentEvent.create(
      [{
        employeeId: e._id,
        type: "separation",
        effectiveDate: new Date(`${s.lastDay}T00:00:00+03:00`),
        summary: `${KIND_LABELS[s.kind as keyof typeof KIND_LABELS]} (${s.number})`,
        from: { jobTitle: e.jobTitle, grade: e.grade, status: e.status },
        to: { status: "separated" },
        actorName: actor.name,
        requestId: s._id,
      }],
      { session },
    );
    // Their login stops working at once: disabled, and every open session invalidated.
    await User.updateOne({ employeeId: e._id }, { status: "disabled", $inc: { sessionVersion: 1 } }, { session });
    return true;
  });
  if (done) {
    await record(actor, {
      action: "separation.complete",
      entity: "employee",
      entityId: String(s.employeeId),
      summary: `${s.employeeName} has left (${s.number}): record closed, login disabled`,
    });
  }
  return done;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function load(id: string): Promise<SepDoc> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Separation");
  await connectDB();
  const s = await Separation.findById(id).lean<SepDoc>();
  if (!s) throw new NotFoundError("Separation");
  return s;
}

export async function getSeparation(ctx: Ctx, id: string, now = new Date()) {
  const s = await load(id);
  const subject = subjectOf(s.workflow);
  const own = ctx.employee?.id === String(s.employeeId);
  const hr = can(ctx, "separation:approve", subject);
  const signer = s.clearance.some((c) => canSign(ctx, s, c.departmentId));
  const visible = own || hr || signer || ctx.userId === s.workflow.requestedById || decisionRight(ctx, s.workflow).ok || can(ctx, "separation:initiate", subject);
  if (!visible) throw new ForbiddenError();

  const emp = await Employee.findById(s.employeeId).lean<Stored>();
  const annual = emp && (hr || own) ? (await balancesFor(emp, Number(s.lastDay.slice(0, 4)))).find((b) => b.code === "ANNUAL") : null;
  const right = decisionRight(ctx, s.workflow);
  const notice = daysBetween(toISODate(s.workflow.requestedAt), s.lastDay);
  return {
    sep: {
      ...s,
      // Exit interview answers: HR and the leaver only, never the manager.
      exitInterview: hr || own ? s.exitInterview : s.exitInterview?.submittedAt ? { submittedAt: s.exitInterview.submittedAt } : null,
    },
    own,
    hr,
    canDecide: right.ok,
    whyNot: right.ok ? null : right.why,
    canWithdraw: ctx.userId === s.workflow.requestedById && s.workflow.status === "pending",
    signable: s.clearance.filter((c) => !c.signedAt && canSign(ctx, s, c.departmentId)).map((c) => String(c._id)),
    canExitInterview: own && s.workflow.status === "approved" && !s.exitInterview?.submittedAt,
    shortNotice: ["resignation", "termination"].includes(s.kind) && notice < NOTICE_DAYS ? notice : null,
    leaveOwed: annual ? annual.available : null,
    status: s.completedAt ? "completed" : s.workflow.status === "approved" ? (s.lastDay > today(now) || s.clearance.some((c) => !c.signedAt) ? "clearing" : "completing") : s.workflow.status,
  };
}

export async function listSeparations(ctx: Ctx) {
  await connectDB();
  const or: object[] = [];
  for (const perm of ["separation:initiate", "separation:approve"] as const) {
    const f = scopeFilter(ctx, perm, WORKFLOW_SUBJECT_FIELDS);
    if (f) or.push(f);
  }
  if (ctx.employee) or.push({ employeeId: new Types.ObjectId(ctx.employee.id) });
  if (has(ctx, "clearance:signoff") && ctx.employee) {
    or.push({ "clearance.departmentId": new Types.ObjectId(ctx.employee.departmentId), completedAt: null });
  }
  if (!or.length) return { items: [], clearanceTasks: [] };
  const items = await Separation.find({ $or: or }).sort({ createdAt: -1 }).limit(100).lean<SepDoc[]>();
  const clearanceTasks = items.flatMap((s) =>
    s.workflow.status === "approved" && !s.completedAt
      ? s.clearance.filter((c) => !c.signedAt && canSign(ctx, s, c.departmentId)).map((c) => ({ separationId: String(s._id), employeeName: s.employeeName, lastDay: s.lastDay, item: c.item }))
      : [],
  );
  return { items, clearanceTasks };
}

/** Retirement dates come from date of birth, so this list needs PII access. */
export async function upcomingRetirements(ctx: Ctx, months = 12, now = new Date()) {
  const scope = scopeFilter(ctx, "employee.pii:read");
  if (!scope) return null;
  await connectDB();
  const until = new Date(now.getTime() + months * 30.5 * 86_400_000);
  const people = await Employee.find({ $and: [scope, { status: { $ne: "separated" }, retirementDate: { $gte: now, $lte: until } }] })
    .select("firstName lastName jobTitle retirementDate")
    .sort({ retirementDate: 1 })
    .lean<Stored[]>();
  const open = await Separation.find({ employeeId: { $in: people.map((p) => p._id) }, "workflow.status": { $in: ["pending", "approved"] } }).select("employeeId _id").lean();
  return people.map((p) => ({
    id: String(p._id),
    name: `${p.firstName} ${p.lastName}`,
    jobTitle: p.jobTitle,
    retirementDate: p.retirementDate!,
    separationId: open.find((o) => String(o.employeeId) === String(p._id))?._id?.toString() ?? null,
  }));
}
