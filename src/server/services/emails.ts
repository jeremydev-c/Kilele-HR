import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Email } from "../models/Email";
import { authorize } from "../authz";
import { record } from "../audit";
import { AppError, NotFoundError } from "../errors";
import type { Ctx } from "../context";
import { deliveryBlock, resendKey, sendEmail } from "../email/send";

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

/** The unsent emails "Send all unsent" would retry: saved or failed, not retried yet, to an address we may really send to. */
async function unsentQuery() {
  const rows = await Email.find({ status: { $in: ["saved", "failed"] }, retriedAt: null }).select("to").lean();
  return rows.filter((r) => !deliveryBlock(r.to)).map((r) => r._id);
}

export async function countUnsent(ctx: Ctx) {
  authorize(ctx, "email:read");
  await connectDB();
  return (await unsentQuery()).length;
}

async function resendOne(ctx: Ctx, id: Types.ObjectId | string) {
  const e = await Email.findOneAndUpdate(
    { _id: id, retriedAt: null, status: { $in: ["saved", "failed"] } },
    { $set: { retriedAt: new Date(), retriedByName: ctx.name } },
  ).lean();
  if (!e) return null; // already retried (or sent) by someone else
  const status = await sendEmail({
    to: e.to, toName: e.toName, subject: e.subject, html: e.html, text: e.text,
    kind: e.kind, entity: e.entity ?? undefined, entityId: e.entityId ?? undefined,
  });
  await record(ctx, { action: "email.resend", entity: "email", entityId: String(e._id), summary: `Sent again: "${e.subject}" to ${e.toName || e.to} (${status})` });
  return status;
}

/** "Send again" on one email. */
export async function resendEmail(ctx: Ctx, id: string) {
  authorize(ctx, "email:read");
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Email");
  await connectDB();
  const e = await Email.findById(id).select("to status retriedAt").lean();
  if (!e) throw new NotFoundError("Email");
  if (e.retriedAt) throw new AppError("This one was already sent again. Open the newest copy instead.");
  if (!["saved", "failed"].includes(e.status)) throw new AppError("Only saved or failed emails can be sent again.");
  const block = deliveryBlock(e.to);
  if (block) throw new AppError(block);
  if (!resendKey()) throw new AppError("Email sending isn't switched on (no Resend key), so it would only be saved again.");
  return resendOne(ctx, id);
}

/** "Send all unsent": every saved or failed email to a real address, once each. */
export async function resendUnsent(ctx: Ctx) {
  authorize(ctx, "email:read");
  if (!resendKey()) throw new AppError("Email sending isn't switched on (no Resend key).");
  await connectDB();
  const ids = (await unsentQuery()).slice(0, 50);
  const tally = { sent: 0, failed: 0, other: 0 };
  for (const id of ids) {
    const s = await resendOne(ctx, id);
    if (s === "sent") tally.sent++;
    else if (s === "failed") tally.failed++;
    else if (s) tally.other++;
  }
  return tally;
}
