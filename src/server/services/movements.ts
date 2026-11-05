import { Types } from "mongoose";
import { z } from "zod";
import { connectDB, withTransaction } from "@/lib/db";
import { GRADES, gradeLabel } from "@/lib/grades";
import { toISODate } from "@/lib/leaveDays";
import { Employee, type EmployeeRecord } from "../models/Employee";
import { Department } from "../models/Department";
import { EmploymentEvent } from "../models/EmploymentEvent";
import { Movement, type MovementRecord } from "../models/Movement";
import { nextNumber } from "../models/Counter";
import { authorize, can, scopeFilter } from "../authz";
import { record, type Actor } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { decisionRight, startWorkflow, subjectOf, WORKFLOW_SUBJECT_FIELDS, type WorkflowDef } from "../workflow";
import type { Ctx } from "../context";
import { notifyApprovers } from "../email/notify";

type Stored = EmployeeRecord & { _id: Types.ObjectId };
type MoveDoc = MovementRecord & { _id: Types.ObjectId };

/**
 * A senior manager (the proposer's boss, never the proposer) then HR.
 * distinctApprovers: the same person can't approve both steps of a career move.
 */
export const MOVEMENT_WORKFLOW: WorkflowDef = {
  steps: [
    { key: "senior", label: "Senior manager", approver: { kind: "manager", perm: "promotion:initiate" } },
    { key: "hr", label: "HR", approver: { kind: "permission", perm: "promotion:approve", scope: "all" } },
  ],
  distinctApprovers: true,
};

const today = (now = new Date()) => toISODate(new Date(now.getTime() + 3 * 3_600_000));
const gradeIndex = (code: string) => GRADES.findIndex((g) => g.code === code);

/**
 * Pay when nobody with pay rights chose a figure: moved into the new band.
 * Promotion: at least the new grade's minimum, never a pay cut.
 * Demotion: capped at the new grade's maximum.
 */
export function salaryForMove(current: number, newGrade: string, kind: "promotion" | "demotion") {
  const g = GRADES.find((x) => x.code === newGrade)!;
  return kind === "promotion" ? Math.min(Math.max(current, g.min), g.max) : Math.max(Math.min(current, g.max), g.min);
}

const ProposeInput = z.object({
  employeeId: z.string().refine((s) => Types.ObjectId.isValid(s), "Pick an employee."),
  jobTitle: z.string().trim().min(2, "Enter the new job title.").max(100),
  grade: z.enum(GRADES.map((g) => g.code) as [string, ...string[]], { message: "Choose the new grade." }),
  basicSalary: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional()),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the effective date."),
  justification: z.string().trim().min(30, "Explain the reason (at least 30 characters). Approvers decide on this."),
});

export async function proposeMovement(ctx: Ctx, input: unknown, now = new Date()) {
  const data = ProposeInput.parse(input);
  await connectDB();
  const e = await Employee.findById(data.employeeId).lean<Stored>();
  if (!e || e.status === "separated") throw new NotFoundError("Employee");
  authorize(ctx, "promotion:initiate", e);
  if (ctx.employee?.id === data.employeeId) throw new AppError("You can't propose your own promotion.");

  const from = gradeIndex(e.grade);
  const to = gradeIndex(data.grade);
  if (to === from && data.jobTitle === e.jobTitle) throw new AppError("That's their current job and grade.");
  if (to === from) throw new AppError("A title change on the same grade is an edit, not a promotion. HR can change it on the profile.");
  const kind = to > from ? "promotion" : "demotion";

  const t = today(now);
  const max = toISODate(new Date(now.getTime() + 120 * 86_400_000));
  if (data.effectiveDate < t || data.effectiveDate > max) throw new AppError("The effective date must be between today and four months from now.");
  if (await Movement.exists({ employeeId: e._id, $or: [{ "workflow.status": "pending" }, { "workflow.status": "approved", appliedAt: null }] })) {
    throw new AppError("There's already a promotion or demotion in progress for this person.");
  }

  // Choosing a figure needs pay rights for this person; otherwise the band rule decides.
  const current = e.pay?.basicSalary ?? 0;
  const g = GRADES[to];
  let salary: number;
  if (data.basicSalary !== undefined) {
    if (!can(ctx, "employee.pay:read", e)) throw new ForbiddenError("You can't set salaries. Leave it blank and the pay moves into the new band.");
    if (data.basicSalary < g.min || data.basicSalary > g.max) throw new AppError(`${g.code} pays KES ${g.min.toLocaleString()}–${g.max.toLocaleString()}.`);
    if (kind === "promotion" && data.basicSalary < current) throw new AppError("A promotion can't come with a pay cut.");
    salary = data.basicSalary;
  } else {
    salary = salaryForMove(current, data.grade, kind);
  }

  const year = now.getUTCFullYear();
  const doc = await withTransaction(async (session) => {
    const number = `MV-${year}-${String(await nextNumber(`mv-${year}`, session)).padStart(4, "0")}`;
    const workflow = await startWorkflow(MOVEMENT_WORKFLOW, e, ctx, now);
    const [m] = await Movement.create(
      [{
        number, kind, employeeId: e._id, employeeName: `${e.firstName} ${e.lastName}`,
        from: { jobTitle: e.jobTitle, grade: e.grade, basicSalary: current },
        to: { jobTitle: data.jobTitle, grade: data.grade, basicSalary: salary },
        salaryChosen: data.basicSalary !== undefined,
        effectiveDate: data.effectiveDate, justification: data.justification, workflow,
      }],
      { session },
    );
    return m;
  });
  await record(ctx, {
    action: `promotion.propose`,
    entity: "movement",
    entityId: String(doc._id),
    summary: `Proposed a ${kind} for ${doc.employeeName}: ${gradeLabel(e.grade)} → ${gradeLabel(data.grade)} (${doc.number})`,
    reason: data.justification,
  });
  await notifyApprovers("promotion", doc._id);
  return String(doc._id);
}

/** Who may see a proposal: proposer, approvers, HR, and managers whose scope covers the person (not the person, while pending). */
function canSee(ctx: Ctx, m: MoveDoc) {
  const subject = subjectOf(m.workflow);
  if (ctx.userId === m.workflow.requestedById || decisionRight(ctx, m.workflow).ok) return true;
  if (can(ctx, "promotion:approve", subject) || can(ctx, "promotion:initiate", subject)) return true;
  return ctx.employee?.id === String(m.employeeId) && m.workflow.status === "approved";
}

function withPay(ctx: Ctx, m: MoveDoc) {
  const pay = can(ctx, "employee.pay:read", subjectOf(m.workflow));
  return {
    ...m,
    from: { ...m.from, basicSalary: pay ? m.from.basicSalary : undefined },
    to: { ...m.to, basicSalary: pay ? m.to.basicSalary : undefined },
    seesPay: pay,
  };
}

export async function getMovement(ctx: Ctx, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Request");
  await connectDB();
  const m = await Movement.findById(id).lean<MoveDoc>();
  if (!m) throw new NotFoundError("Request");
  if (!canSee(ctx, m)) throw new ForbiddenError();
  const right = decisionRight(ctx, m.workflow);
  return { move: withPay(ctx, m), canDecide: right.ok, whyNot: right.ok ? null : right.why, scheduled: m.workflow.status === "approved" && !m.appliedAt };
}

export async function listMovements(ctx: Ctx) {
  const scopes = [scopeFilter(ctx, "promotion:initiate", WORKFLOW_SUBJECT_FIELDS), scopeFilter(ctx, "promotion:approve", WORKFLOW_SUBJECT_FIELDS)].filter(Boolean);
  if (!scopes.length) throw new ForbiddenError();
  await connectDB();
  const docs = await Movement.find({ $or: scopes as object[] }).sort({ createdAt: -1 }).limit(100).lean<MoveDoc[]>();
  return docs.map((m) => withPay(ctx, m));
}

const SCHEDULER: Actor = { id: null, name: "Scheduler", ip: null };

/**
 * Write an approved move to the employee record, if its date has come.
 * Called right after the final approval, and by the scheduled job
 * (src/server/jobs.ts) for future-dated moves. Safe to call twice: the
 * `appliedAt: null` filter means only one caller can claim it.
 */
export async function applyMovementIfDue(id: unknown, now = new Date(), actor: Actor = SCHEDULER) {
  await connectDB();
  const m = await Movement.findOne({ _id: id, "workflow.status": "approved", appliedAt: null, effectiveDate: { $lte: today(now) } }).lean<MoveDoc>();
  if (!m) return false;
  return withTransaction(async (session) => {
    const claimed = await Movement.updateOne({ _id: m._id, appliedAt: null }, { appliedAt: now }, { session });
    if (!claimed.modifiedCount) return false;
    const e = await Employee.findById(m.employeeId).session(session).lean<Stored>();
    if (!e || e.status === "separated") return false;
    const dept = await Department.findById(e.departmentId).select("name").session(session).lean();
    await Employee.updateOne(
      { _id: e._id },
      { jobTitle: m.to.jobTitle, grade: m.to.grade, "pay.basicSalary": m.to.basicSalary },
      { session },
    );
    await EmploymentEvent.create(
      [{
        employeeId: e._id,
        type: m.kind,
        effectiveDate: new Date(`${m.effectiveDate}T00:00:00+03:00`),
        summary: `${m.kind === "promotion" ? "Promoted" : "Moved"} to ${m.to.jobTitle} (${m.number})`,
        from: { jobTitle: m.from.jobTitle, grade: m.from.grade, basicSalary: m.from.basicSalary, departmentName: dept?.name },
        to: { jobTitle: m.to.jobTitle, grade: m.to.grade, basicSalary: m.to.basicSalary, departmentName: dept?.name },
        actorName: actor.name,
        requestId: m._id,
      }],
      { session },
    );
    await record(actor, {
      action: `promotion.apply`,
      entity: "employee",
      entityId: String(e._id),
      summary: `Applied ${m.number}: ${m.employeeName} is now ${m.to.jobTitle}, ${gradeLabel(m.to.grade ?? "")}`,
      changes: [
        { field: "jobTitle", from: m.from.jobTitle ?? "", to: m.to.jobTitle ?? "" },
        { field: "grade", from: m.from.grade ?? "", to: m.to.grade ?? "" },
        { field: "basicSalary", from: "[redacted]", to: "[redacted]" },
      ],
    });
    return true;
  });
}


