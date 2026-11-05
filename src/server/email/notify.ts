import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { User } from "../models/User";
import { Employee } from "../models/Employee";
import { LeaveRequest } from "../models/Leave";
import { Requisition } from "../models/Recruitment";
import { Movement } from "../models/Movement";
import { Separation } from "../models/Separation";
import { ctxForUser } from "../context";
import { has } from "../authz";
import { decisionRight, type WorkflowState } from "../workflow";
import { appUrl, sendAll, sendEmail, type Outgoing } from "./send";
import * as T from "./templates";

/**
 * Who gets which email. Services call these after their change is saved;
 * none of them throws (an email problem never undoes the work).
 */

type Recipient = { email: string; name: string };
const quiet = (where: string) => (err: unknown) => console.error(`[email] ${where} failed`, err);

const nairobi = new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Nairobi" });
const day = (d: Date | string) => new Intl.DateTimeFormat("en-KE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(d));
const MODE: Record<string, string> = { in_person: "In person", video: "Video call", phone: "Phone call" };

// ---------------------------------------------------------------- approvals

export type WorkflowType = "leave" | "requisition" | "promotion" | "separation";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WfDoc = { _id: Types.ObjectId; workflow: WorkflowState } & Record<string, any>;

const MODELS = { leave: LeaveRequest, requisition: Requisition, promotion: Movement, separation: Separation };
const PATH = { leave: "leave", requisition: "recruitment/requisitions", promotion: "promotions", separation: "separations" };

function describe(type: WorkflowType, d: WfDoc) {
  if (type === "leave") return `${d.employeeName}: ${String(d.typeName).toLowerCase()}, ${d.days} day${d.days === 1 ? "" : "s"} (${d.start} to ${d.end})`;
  if (type === "requisition") return `Hire ${d.openings} × ${d.title} for ${d.hiringManagerName}`;
  if (type === "promotion") return `${d.employeeName}: ${d.kind} to ${d.to?.jobTitle}`;
  return `${d.employeeName}: ${String(d.kind).replace(/_/g, " ")}, last day ${d.lastDay}`;
}

async function load(type: WorkflowType, id: unknown) {
  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (MODELS[type] as any).findById(id).lean()) as WfDoc | null;
}

/** Exactly the people the inbox would show this request to (the same decisionRight rule). */
async function approversOf(wf: WorkflowState): Promise<Recipient[]> {
  if (wf.status !== "pending") return [];
  const step = wf.steps[wf.current];
  if (step.kind === "manager") {
    const u = await User.findOne({ employeeId: step.assigneeId, status: "active" }).lean();
    return u ? [{ email: u.email, name: u.name }] : [];
  }
  const users = await User.find({ status: "active" }).lean();
  const ok: (Recipient & { admin: boolean })[] = [];
  for (const u of users) {
    const ctx = await ctxForUser(u, null);
    if (decisionRight(ctx, wf).ok) ok.push({ email: u.email, name: u.name, admin: ctx.isSuperAdmin });
  }
  // The Super Admin can approve anything, but only hears about it when nobody else can.
  const people = ok.filter((r) => !r.admin);
  return people.length ? people : ok;
}

async function notifyApproversNow(type: WorkflowType, d: WfDoc) {
  const link = `${appUrl()}/${PATH[type]}/${d._id}`;
  const step = d.workflow.steps[d.workflow.current]?.label ?? "";
  const people = await approversOf(d.workflow);
  await sendAll(
    people.map((p): Outgoing => ({
      to: p.email, toName: p.name, kind: "approval.needed", entity: type, entityId: String(d._id),
      ...T.approvalNeeded({ name: p.name, what: describe(type, d), step, requestedBy: d.workflow.requestedByName, link }),
    })),
  );
}

/** A new request, or one that just moved to its next step: tell whoever decides now. */
export function notifyApprovers(type: WorkflowType, id: unknown) {
  return load(type, id)
    .then((d) => d && notifyApproversNow(type, d))
    .catch(quiet(`approvers for ${type}`));
}

/** After a decision: the requester hears the outcome; the next approver hears it's their turn. */
export function notifyDecision(type: WorkflowType, id: unknown, byName: string, comment?: string) {
  return (async () => {
    const d = await load(type, id);
    if (!d) return;
    const wf = d.workflow;
    const outcome = wf.status === "approved" ? "approved" : wf.status === "rejected" ? "rejected" : "next";
    const link = `${appUrl()}/${PATH[type]}/${d._id}`;
    const what = describe(type, d);
    const out: Outgoing[] = [];

    const requester = await User.findById(wf.requestedById).lean();
    if (requester) {
      out.push({
        to: requester.email, toName: requester.name, kind: `decision.${outcome}`, entity: type, entityId: String(d._id),
        ...T.decided({ name: requester.name, what, outcome, by: byName, nextStep: wf.steps[wf.current]?.label, comment, link }),
      });
    }
    // Promotions and exits are about someone else: they hear the final answer too.
    if (outcome !== "next" && (type === "promotion" || type === "separation")) {
      const subject = await User.findOne({ employeeId: wf.subject.employeeId, status: "active" }).lean();
      if (subject && String(subject._id) !== wf.requestedById) {
        out.push({
          to: subject.email, toName: subject.name, kind: `decision.${outcome}`, entity: type, entityId: String(d._id),
          ...T.decided({ name: subject.name, what, outcome, by: byName, link }),
        });
      }
    }
    await sendAll(out);
    if (outcome === "next") await notifyApproversNow(type, d);
  })().catch(quiet(`decision on ${type}`));
}

// ---------------------------------------------------------------- applicants

type App = {
  _id: Types.ObjectId;
  number: string;
  candidate: { name: string; email: string };
  statusTokenEnc?: string | null;
  interviews?: { at: Date; durationMins: number; mode: string; where: string; panel: { employeeId: Types.ObjectId; name: string }[] }[];
  offer?: { basicSalary?: number | null; startDate?: string | null; expiresOn?: string | null } | null;
};
type Vac = { title: string; departmentName: string; hiringManagerId?: Types.ObjectId };

function statusLink(a: App) {
  try {
    return a.statusTokenEnc ? `${appUrl()}/careers/status/${decrypt(a.statusTokenEnc)}` : undefined;
  } catch {
    return undefined;
  }
}

function toCandidate(a: App, kind: string, mail: T.Mail): Outgoing {
  return { to: a.candidate.email, toName: a.candidate.name, kind, entity: "application", entityId: String(a._id), ...mail };
}

export function onApplied(a: App, v: Vac, token: string) {
  const link = `${appUrl()}/careers/status/${token}`;
  return sendEmail(toCandidate(a, "application.received", T.applicationReceived({ name: a.candidate.name, job: v.title, number: a.number, link })))
    .catch(quiet("application received"));
}

export function onStageChange(a: App, v: Vac, to: string) {
  if (to === "shortlisted") {
    return sendEmail(toCandidate(a, "application.shortlisted", T.shortlisted({ name: a.candidate.name, job: v.title, link: statusLink(a) }))).catch(quiet("shortlisted"));
  }
  if (to === "rejected") {
    return sendEmail(toCandidate(a, "application.rejected", T.notSuccessful({ name: a.candidate.name, job: v.title }))).catch(quiet("rejected"));
  }
  return Promise.resolve();
}

export function onInterviewScheduled(a: App, v: Vac) {
  return (async () => {
    const i = a.interviews!.at(-1)!;
    const when = nairobi.format(new Date(i.at));
    const out: Outgoing[] = [
      toCandidate(a, "interview.invite", T.interviewInvite({ name: a.candidate.name, job: v.title, when, minutes: i.durationMins, how: MODE[i.mode] ?? i.mode, where: i.where, link: statusLink(a) })),
    ];
    const users = await User.find({ employeeId: { $in: i.panel.map((p) => p.employeeId) }, status: "active" }).lean();
    for (const u of users) {
      out.push({
        to: u.email, toName: u.name, kind: "interview.panel", entity: "application", entityId: String(a._id),
        ...T.panelInvite({ name: u.name, candidate: a.candidate.name, job: v.title, when, how: MODE[i.mode] ?? i.mode, where: i.where, link: `${appUrl()}/recruitment/applications/${a._id}` }),
      });
    }
    await sendAll(out);
  })().catch(quiet("interview scheduled"));
}

export function onOffer(a: App, v: Vac) {
  const o = a.offer!;
  return sendEmail(
    toCandidate(a, "offer.made", T.offerMade({
      name: a.candidate.name, job: v.title, salary: `KES ${Number(o.basicSalary).toLocaleString("en-KE")} a month`,
      start: day(o.startDate!), replyBy: day(o.expiresOn!), link: statusLink(a),
    })),
  ).catch(quiet("offer"));
}

export function onCandidateAnswer(a: App, v: Vac, accepted: boolean) {
  return (async () => {
    if (!v.hiringManagerId) return;
    const u = await User.findOne({ employeeId: v.hiringManagerId, status: "active" }).lean();
    if (!u) return;
    await sendEmail({
      to: u.email, toName: u.name, kind: accepted ? "offer.accepted" : "offer.declined", entity: "application", entityId: String(a._id),
      ...T.offerAnswered({ name: u.name, candidate: a.candidate.name, job: v.title, accepted, link: `${appUrl()}/recruitment/applications/${a._id}` }),
    });
  })().catch(quiet("offer answer"));
}

export function onHired(a: App, v: Vac, employeeId: string) {
  return (async () => {
    const e = await Employee.findById(employeeId).select("workEmail hireDate").lean();
    if (!e) return;
    await sendEmail(toCandidate(a, "hire.welcome", T.welcome({
      name: a.candidate.name, job: v.title, department: v.departmentName, start: day(e.hireDate), workEmail: e.workEmail, link: `${appUrl()}/login`,
    })));
  })().catch(quiet("welcome"));
}

// ---------------------------------------------------------------- exits and accounts

/** Each department with clearance items hears from us once, with its own list. */
export function onClearanceStarted(separationId: unknown) {
  return (async () => {
    await connectDB();
    const s = await Separation.findById(separationId).lean();
    if (!s?.clearance?.length) return;
    const byDept = new Map<string, { name: string; items: string[] }>();
    for (const c of s.clearance) {
      if (c.signedAt) continue;
      const k = String(c.departmentId);
      const entry = byDept.get(k) ?? { name: c.departmentName, items: [] };
      entry.items.push(c.item);
      byDept.set(k, entry);
    }
    const users = await User.find({ status: "active", employeeId: { $ne: null } }).lean();
    const out: Outgoing[] = [];
    for (const u of users) {
      const ctx = await ctxForUser(u, null);
      if (!ctx.employee || ctx.employee.id === String(s.employeeId) || !has(ctx, "clearance:signoff")) continue;
      const mine = byDept.get(ctx.employee.departmentId);
      if (!mine) continue;
      out.push({
        to: u.email, toName: u.name, kind: "clearance.needed", entity: "separation", entityId: String(s._id),
        ...T.clearanceNeeded({ name: u.name, leaver: s.employeeName, department: mine.name, items: mine.items, lastDay: day(s.lastDay), link: `${appUrl()}/separations/${s._id}` }),
      });
    }
    await sendAll(out);
  })().catch(quiet("clearance"));
}

export function onAccountCreated(u: { _id: unknown; email: string; name: string }) {
  return sendEmail({
    to: u.email, toName: u.name, kind: "account.created", entity: "user", entityId: String(u._id),
    ...T.accountCreated({ name: u.name, email: u.email, link: `${appUrl()}/login` }),
  }).catch(quiet("account created"));
}

export function onPasswordReset(u: { _id: unknown; email: string; name: string }, byName: string) {
  return sendEmail({
    to: u.email, toName: u.name, kind: "account.password_reset", entity: "user", entityId: String(u._id),
    ...T.passwordReset({ name: u.name, by: byName, link: `${appUrl()}/login` }),
  }).catch(quiet("password reset"));
}

/** An announcement or meeting: one email to each person it was sent to. */
export function onAnnouncement(a: {
  _id: unknown; kind: string; title: string; body: string; authorName: string;
  meeting?: { at: Date; durationMins: number; where: string } | null; recipientIds: Types.ObjectId[];
}) {
  return (async () => {
    const [users, people] = await Promise.all([
      User.find({ employeeId: { $in: a.recipientIds }, status: "active" }).select("email name employeeId").lean<{ email: string; name: string; employeeId: Types.ObjectId }[]>(),
      Employee.find({ _id: { $in: a.recipientIds } }).select("firstName lastName workEmail").lean(),
    ]);
    const link = `${appUrl()}/announcements/${a._id}`;
    const meeting = a.meeting ? { when: nairobi.format(new Date(a.meeting.at)), minutes: a.meeting.durationMins, where: a.meeting.where } : undefined;
    // Their login email if they have one, otherwise their work email.
    const out = people.map((p): Outgoing => {
      const u = users.find((x) => String(x.employeeId) === String(p._id));
      const name = u?.name ?? `${p.firstName} ${p.lastName}`;
      return {
        to: u?.email ?? p.workEmail, toName: name, kind: a.kind === "meeting" ? "announcement.meeting" : "announcement.sent",
        entity: "announcement", entityId: String(a._id),
        ...T.announcement({ name, from: a.authorName, title: a.title, body: a.body, meeting, link }),
      };
    });
    await sendAll(out);
  })().catch(quiet("announcement"));
}
