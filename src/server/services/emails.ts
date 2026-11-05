import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Email } from "../models/Email";
import { authorize } from "../authz";
import { record } from "../audit";
import { NotFoundError } from "../errors";
import type { Ctx } from "../context";
import { resendKey } from "../email/send";

/** The Emails page: everything the system wrote, newest first. Needs email:read (emails can hold pay and personal details). */

export const EMAIL_STATUSES = { sent: "Sent", saved: "Saved, not sent", skipped: "Demo address", failed: "Failed" } as const;
export const STATUS_TONE = { sent: "green", saved: "blue", skipped: "gray", failed: "red" } as const;
type Status = keyof typeof EMAIL_STATUSES;

export async function listEmails(ctx: Ctx, opts: { status?: string; q?: string }) {
  authorize(ctx, "email:read");
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (opts.status && opts.status in EMAIL_STATUSES) filter.status = opts.status;
  const q = opts.q?.trim();
  if (q) {
    const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ to: rx }, { toName: rx }, { subject: rx }];
  }
  const [emails, counts] = await Promise.all([
    Email.find(filter).select("-html -text").sort({ createdAt: -1 }).limit(200).lean(),
    Email.aggregate<{ _id: Status; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
  ]);
  return {
    emails: emails.map((e) => ({ ...e, id: String(e._id) })),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) as Partial<Record<Status, number>>,
    sendingOn: !!resendKey(),
  };
}

export async function getEmail(ctx: Ctx, id: string) {
  authorize(ctx, "email:read");
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Email");
  await connectDB();
  const e = await Email.findById(id).lean();
  if (!e) throw new NotFoundError("Email");
  await record(ctx, { action: "email.view", entity: "email", entityId: id, summary: `Opened the email "${e.subject}" to ${e.toName || e.to}` });
  return { ...e, id: String(e._id) };
}

/** Where the thing an email is about lives in the app. */
export function relatedHref(entity?: string | null, id?: string | null) {
  if (!entity || !id) return null;
  const path: Record<string, string> = {
    application: "/recruitment/applications/", leave: "/leave/", requisition: "/recruitment/requisitions/",
    promotion: "/promotions/", separation: "/separations/", user: "/admin/users/",
  };
  return path[entity] ? path[entity] + id : null;
}
