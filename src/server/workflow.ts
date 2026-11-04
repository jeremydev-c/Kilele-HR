import { Schema, Types, type QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { SCOPES, type Permission, type Scope } from "@/lib/permissions";
import { User } from "./models/User";
import { Employee } from "./models/Employee";
import { can, hasScope } from "./authz";
import { ctxForUser, type Ctx } from "./context";

/**
 * ONE approval engine for every module (docs/DESIGN.md §5).
 *
 * Leave, promotions, job requisitions and separations all follow
 * "submit → approver 1 → approver 2 → done". Each request type only declares
 * its steps; this file does routing, the rules on who may decide,
 * advancing, and the "waiting for…" inbox.
 *
 * A step's approver is either:
 *   manager     the nearest manager up the reporting line who holds `perm`
 *               for this employee (skips a team lead who lacks approval rights)
 *   permission  anyone holding `perm` at `scope`, e.g. leave:approve@all = HR
 */

export type ApproverRule =
  | { kind: "manager"; perm: Permission }
  | { kind: "permission"; perm: Permission; scope: Scope };

export type StepDef = { key: string; label: string; approver: ApproverRule };

export type WorkflowDef = {
  steps: StepDef[];
  /**
   * true: each step needs a different person (separation of duties, e.g.
   * promotions). false: if the person who just approved is also eligible
   * for the next step, it's approved in the same click and recorded so.
   */
  distinctApprovers: boolean;
};

// ---------------------------------------------------------------------------
// Stored shape (embedded in each request document)
// ---------------------------------------------------------------------------

const StepSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    kind: { type: String, enum: ["manager", "permission"], required: true },
    perm: { type: String, required: true },
    scope: { type: String, enum: SCOPES, default: null },
    /** Manager steps: the employee who must decide (resolved when submitted). */
    assigneeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    assigneeName: { type: String, default: null },
    status: { type: String, enum: ["waiting", "pending", "approved", "rejected", "skipped"], default: "waiting" },
    decidedById: { type: String, default: null },
    decidedByName: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    comment: { type: String, default: "" },
  },
  { _id: false },
);

export const WorkflowSchema = new Schema(
  {
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
    current: { type: Number, default: 0 },
    distinctApprovers: { type: Boolean, default: false },
    steps: { type: [StepSchema], default: [] },
    /** Copy of the current step's routing, so the inbox is one indexed query. */
    pendingWith: {
      kind: { type: String, default: null },
      employeeId: { type: Schema.Types.ObjectId, default: null },
      perm: { type: String, default: null },
      scope: { type: String, default: null },
    },
    /** Copy of the employee's scope fields, for scopeFilter() on request lists. */
    subject: {
      employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
      departmentId: { type: Schema.Types.ObjectId, required: true },
      managerPath: { type: [Schema.Types.ObjectId], default: [] },
    },
    requestedById: { type: String, required: true },
    requestedByName: { type: String, required: true },
    requestedAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
  },
  { _id: false },
);

WorkflowSchema.index({ status: 1, "pendingWith.employeeId": 1 });

export type StepState = {
  key: string;
  label: string;
  kind: "manager" | "permission";
  perm: string;
  scope: Scope | null;
  assigneeId: Types.ObjectId | null;
  assigneeName: string | null;
  status: "waiting" | "pending" | "approved" | "rejected" | "skipped";
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: Date | null;
  comment: string;
};

export type WorkflowState = {
  status: "pending" | "approved" | "rejected" | "cancelled";
  current: number;
  distinctApprovers: boolean;
  steps: StepState[];
  pendingWith: { kind: string | null; employeeId: Types.ObjectId | null; perm: string | null; scope: string | null };
  subject: { employeeId: Types.ObjectId; departmentId: Types.ObjectId; managerPath: Types.ObjectId[] };
  requestedById: string;
  requestedByName: string;
  requestedAt: Date;
  closedAt: Date | null;
};

/** The workflow's subject in the shape authz.can() expects. */
export function subjectOf(wf: Pick<WorkflowState, "subject">) {
  return { _id: wf.subject.employeeId, departmentId: wf.subject.departmentId, managerPath: wf.subject.managerPath };
}

// ---------------------------------------------------------------------------
// Starting a workflow
// ---------------------------------------------------------------------------

type SubjectEmployee = { _id: Types.ObjectId; departmentId: Types.ObjectId; managerPath: Types.ObjectId[] };

/** Walk up the reporting line to the first active manager who holds `perm` for this employee. */
async function nearestApprover(subject: SubjectEmployee, perm: Permission) {
  const chain = [...subject.managerPath].reverse(); // nearest first
  if (!chain.length) return null;
  const [users, people] = await Promise.all([
    User.find({ employeeId: { $in: chain }, status: "active" }).lean(),
    Employee.find({ _id: { $in: chain } }).select("firstName lastName").lean(),
  ]);
  for (const managerId of chain) {
    const user = users.find((u) => String(u.employeeId) === String(managerId));
    if (!user) continue;
    const ctx = await ctxForUser(user, null);
    if (can(ctx, perm, subject)) {
      const p = people.find((x) => String(x._id) === String(managerId))!;
      return { id: managerId, name: `${p.firstName} ${p.lastName}` };
    }
  }
  return null;
}

export async function startWorkflow(
  def: WorkflowDef,
  subject: SubjectEmployee,
  requester: Ctx,
  now = new Date(),
): Promise<WorkflowState> {
  await connectDB();
  const steps: StepState[] = [];
  for (const s of def.steps) {
    const base = {
      key: s.key, label: s.label, kind: s.approver.kind, perm: s.approver.perm,
      scope: s.approver.kind === "permission" ? s.approver.scope : null,
      assigneeId: null, assigneeName: null, status: "waiting" as const,
      decidedById: null, decidedByName: null, decidedAt: null, comment: "",
    };
    if (s.approver.kind === "manager") {
      const m = await nearestApprover(subject, s.approver.perm);
      steps.push(
        m
          ? { ...base, assigneeId: m.id, assigneeName: m.name }
          : { ...base, status: "skipped", comment: "No manager above this person can approve this, so the step was skipped." },
      );
    } else {
      steps.push(base);
    }
  }
  const wf: WorkflowState = {
    status: "pending",
    current: 0,
    distinctApprovers: def.distinctApprovers,
    steps,
    pendingWith: { kind: null, employeeId: null, perm: null, scope: null },
    subject: { employeeId: subject._id, departmentId: subject.departmentId, managerPath: subject.managerPath },
    requestedById: requester.userId,
    requestedByName: requester.name,
    requestedAt: now,
    closedAt: null,
  };
  moveToNextOpenStep(wf, 0, now);
  return wf;
}

/** Make step `from` (or the next not-skipped one) current; finish if none are left. */
function moveToNextOpenStep(wf: WorkflowState, from: number, now: Date) {
  let i = from;
  while (i < wf.steps.length && wf.steps[i].status === "skipped") i++;
  wf.current = i;
  if (i >= wf.steps.length) {
    wf.status = "approved";
    wf.closedAt = now;
    wf.pendingWith = { kind: null, employeeId: null, perm: null, scope: null };
    return;
  }
  const step = wf.steps[i];
  step.status = "pending";
  wf.pendingWith = { kind: step.kind, employeeId: step.assigneeId, perm: step.perm, scope: step.scope };
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

/** May this person decide the current step? If not, why not (shown in the UI). */
export function decisionRight(ctx: Ctx, wf: WorkflowState): { ok: true } | { ok: false; why: string } {
  if (wf.status !== "pending") return { ok: false, why: `This request is already ${wf.status}.` };
  // Nobody approves their own request, whatever their role. Not even a Super Admin.
  if (ctx.employee?.id === String(wf.subject.employeeId) || ctx.userId === wf.requestedById) {
    return { ok: false, why: "You can't approve your own request." };
  }
  const step = wf.steps[wf.current];
  if (step.kind === "manager") {
    if (ctx.employee?.id !== String(step.assigneeId)) return { ok: false, why: `Waiting for ${step.assigneeName}.` };
  } else {
    const perm = step.perm as Permission;
    if (!hasScope(ctx, perm, step.scope as Scope) || !can(ctx, perm, subjectOf(wf))) {
      return { ok: false, why: `Waiting for ${step.label} (anyone holding ${step.perm}@${step.scope}).` };
    }
  }
  if (wf.distinctApprovers && wf.steps.some((s, i) => i < wf.current && s.decidedById === ctx.userId)) {
    return { ok: false, why: "You approved an earlier step; this one needs a different person." };
  }
  return { ok: true };
}

/**
 * Apply an approve/reject to the current step (mutates `wf`).
 * Returns the steps decided, which can be more than one when the same
 * person is also the next approver and the workflow allows it.
 */
export function applyDecision(
  ctx: Ctx,
  wf: WorkflowState,
  decision: "approve" | "reject",
  comment: string,
  now = new Date(),
): string[] {
  const right = decisionRight(ctx, wf);
  if (!right.ok) throw new Error(right.why);
  const decided: string[] = [];

  const decide = (status: "approved" | "rejected", text: string) => {
    const step = wf.steps[wf.current];
    Object.assign(step, { status, decidedById: ctx.userId, decidedByName: ctx.name, decidedAt: now, comment: text });
    decided.push(step.label);
  };

  if (decision === "reject") {
    decide("rejected", comment);
    wf.status = "rejected";
    wf.closedAt = now;
    wf.pendingWith = { kind: null, employeeId: null, perm: null, scope: null };
    return decided;
  }

  decide("approved", comment);
  moveToNextOpenStep(wf, wf.current + 1, now);
  while (wf.status === "pending" && !wf.distinctApprovers && decisionRight(ctx, wf).ok) {
    decide("approved", "Also approved at this step (same approver as the previous step).");
    moveToNextOpenStep(wf, wf.current + 1, now);
  }
  return decided;
}

export function cancelWorkflow(ctx: Ctx, wf: WorkflowState, reason: string, now = new Date()) {
  if (wf.status !== "pending" && wf.status !== "approved") throw new Error(`This request is already ${wf.status}.`);
  wf.status = "cancelled";
  wf.closedAt = now;
  const step = wf.steps[wf.current];
  if (step && step.status === "pending") Object.assign(step, { status: "skipped", comment: `Cancelled by ${ctx.name}: ${reason}` });
  wf.pendingWith = { kind: null, employeeId: null, perm: null, scope: null };
}

// ---------------------------------------------------------------------------
// The inbox
// ---------------------------------------------------------------------------

/**
 * A MongoDB filter for "requests that might be waiting for me". Cheap and
 * indexed; callers then keep only those where decisionRight() says ok.
 */
export function waitingForFilter(ctx: Ctx, prefix = "workflow"): QueryFilter<unknown> | null {
  const or: Record<string, unknown>[] = [];
  if (ctx.employee) or.push({ [`${prefix}.pendingWith.employeeId`]: new Types.ObjectId(ctx.employee.id) });
  for (const [perm, scopes] of ctx.grants) {
    const held = scopes.has("all") ? [...SCOPES] : [...scopes];
    or.push({ [`${prefix}.pendingWith.kind`]: "permission", [`${prefix}.pendingWith.perm`]: perm, [`${prefix}.pendingWith.scope`]: { $in: held } });
  }
  return or.length ? { [`${prefix}.status`]: "pending", $or: or } : null;
}
