import { Types, type Model } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { LeaveRequest } from "../models/Leave";
import { Requisition } from "../models/Recruitment";
import { Movement } from "../models/Movement";
import { Separation } from "../models/Separation";
import { applyMovementIfDue } from "./movements";
import { startClearance } from "./separations";
import { record } from "../audit";
import { AppError, NotFoundError } from "../errors";
import { applyDecision, decisionRight, waitingForFilter, type WorkflowState } from "../workflow";
import type { Ctx } from "../context";

/**
 * "My Approvals": one inbox and one decide() for every kind of request.
 * Each module registers its collection here: the engine doesn't care
 * whether it's leave, a promotion or a job requisition.
 */

type Doc = { _id: Types.ObjectId; workflow: WorkflowState } & Record<string, unknown>;

// Each source is a different collection; the engine only touches the shared `workflow` field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = Model<any>;

type Source = {
  type: string;
  label: string;
  model: AnyModel;
  title: (d: Doc) => string;
  detail: (d: Doc) => string;
  href: (d: Doc) => string;
  /**
   * What happens when the last step approves. Runs after the decision is
   * saved; if it ever fails, the scheduled job (server/jobs.ts) catches up,
   * because each hook only acts on "approved but not yet done" records.
   */
  onApproved?: (id: Types.ObjectId, ctx: Ctx, now: Date) => Promise<unknown>;
};

const SOURCES: Source[] = [
  {
    type: "leave",
    label: "Leave",
    model: LeaveRequest as AnyModel,
    title: (d) => `${d.employeeName}: ${String(d.typeName).toLowerCase()}`,
    detail: (d) => `${d.number} · ${d.days} day${d.days === 1 ? "" : "s"} · ${d.start} to ${d.end}`,
    href: (d) => `/leave/${d._id}`,
  },
  {
    type: "requisition",
    label: "Hiring",
    model: Requisition as AnyModel,
    title: (d) => `${d.hiringManagerName}: hire ${d.openings} × ${d.title}`,
    detail: (d) => `${d.number} · grade ${d.grade} · ${d.employmentType}`,
    href: (d) => `/recruitment/requisitions/${d._id}`,
  },
  {
    type: "promotion",
    label: "Promotion",
    model: Movement as AnyModel,
    title: (d) => `${d.employeeName}: ${d.kind} to ${(d.to as { jobTitle: string }).jobTitle}`,
    detail: (d) => `${d.number} · ${(d.from as { grade: string }).grade} → ${(d.to as { grade: string }).grade} · from ${d.effectiveDate}`,
    href: (d) => `/promotions/${d._id}`,
    onApproved: (id, ctx, now) => applyMovementIfDue(id, now, { id: ctx.userId, name: ctx.name, ip: ctx.ip }),
  },
  {
    type: "separation",
    label: "Exit",
    model: Separation as AnyModel,
    title: (d) => `${d.employeeName}: ${String(d.kind).replace(/_/g, " ")}`,
    detail: (d) => `${d.number} · last day ${d.lastDay}`,
    href: (d) => `/separations/${d._id}`,
    onApproved: (id, _ctx, now) => startClearance(id, now),
  },
];

export type InboxItem = {
  type: string;
  label: string;
  id: string;
  title: string;
  detail: string;
  href: string;
  step: string;
  requestedAt: Date;
  requestedByName: string;
};

export async function inbox(ctx: Ctx): Promise<InboxItem[]> {
  const filter = waitingForFilter(ctx);
  if (!filter) return [];
  await connectDB();
  const items: InboxItem[] = [];
  for (const s of SOURCES) {
    const docs = (await s.model.find(filter).sort({ "workflow.requestedAt": 1 }).limit(200).lean()) as unknown as Doc[];
    for (const d of docs) {
      if (!decisionRight(ctx, d.workflow).ok) continue;
      items.push({
        type: s.type,
        label: s.label,
        id: String(d._id),
        title: s.title(d),
        detail: s.detail(d),
        href: s.href(d),
        step: d.workflow.steps[d.workflow.current].label,
        requestedAt: d.workflow.requestedAt,
        requestedByName: d.workflow.requestedByName,
      });
    }
  }
  return items.sort((a, b) => +a.requestedAt - +b.requestedAt);
}

export async function inboxCount(ctx: Ctx) {
  return (await inbox(ctx)).length;
}

const DecisionInput = z
  .object({
    decision: z.enum(["approve", "reject"]),
    comment: z.string().trim().max(500).default(""),
  })
  .refine((v) => v.decision === "approve" || v.comment.length >= 3, {
    path: ["comment"],
    message: "Say why you're rejecting it. The employee will see this.",
  });

export async function decide(ctx: Ctx, type: string, id: string, input: unknown, now = new Date()) {
  const source = SOURCES.find((s) => s.type === type);
  if (!source || !Types.ObjectId.isValid(id)) throw new NotFoundError("Request");
  const { decision, comment } = DecisionInput.parse(input);
  await connectDB();

  const doc = (await source.model.findById(id).lean()) as unknown as Doc | null;
  if (!doc) throw new NotFoundError("Request");
  const wf = doc.workflow;
  const stepBefore = wf.current;

  let decided: string[];
  try {
    decided = applyDecision(ctx, wf, decision, comment, now);
  } catch (e) {
    throw new AppError((e as Error).message);
  }

  // Optimistic concurrency: only save if nobody else decided this step in the
  // meantime (two approvers clicking at once can't both win).
  const res = await source.model.updateOne(
    { _id: doc._id, "workflow.status": "pending", "workflow.current": stepBefore },
    { $set: { workflow: wf } },
  );
  if (!res.modifiedCount) throw new AppError("Someone else just decided this request. Refresh to see the latest.");

  if (wf.status === "approved" && source.onApproved) {
    try {
      await source.onApproved(doc._id, ctx, now);
    } catch (err) {
      console.error(`onApproved for ${type} ${id} failed; the scheduled job will retry`, err);
    }
  }

  const outcome = wf.status === "approved" ? "fully approved" : wf.status === "rejected" ? "rejected" : `approved (${decided.join(" + ")}), now with ${wf.steps[wf.current].label}`;
  await record(ctx, {
    action: `${type}.${decision}`,
    entity: type,
    entityId: id,
    summary: `${decision === "approve" ? "Approved" : "Rejected"} ${source.title(doc)} (${String(doc.number ?? id)}): ${outcome}`,
    reason: comment || undefined,
  });
  return wf.status;
}
