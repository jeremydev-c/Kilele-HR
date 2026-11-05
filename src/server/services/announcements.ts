import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { Announcement } from "../models/Announcement";
import { Employee } from "../models/Employee";
import { Department } from "../models/Department";
import { has, scopeFilter } from "../authz";
import { record } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { onAnnouncement } from "../email/notify";
import type { Ctx } from "../context";

/**
 * Announcements and meeting invites. Who you can reach is your
 * announcement:send scope: HR reaches everyone, a line manager their team.
 * Everyone reads what was sent to them.
 */

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

/** Current colleagues this person may message (never themselves), with their departments. */
async function reachable(ctx: Ctx) {
  const scope = scopeFilter(ctx, "announcement:send");
  if (!scope) return [];
  await connectDB();
  const people = await Employee.find({ $and: [scope, { status: { $ne: "separated" } }] })
    .select("firstName lastName jobTitle departmentId")
    .sort({ firstName: 1, lastName: 1 })
    .lean();
  return people.filter((p) => String(p._id) !== ctx.employee?.id);
}

const everyoneLabel = (ctx: Ctx) =>
  ctx.isSuperAdmin || ctx.grants.get("announcement:send")?.has("all") ? "Everyone in the company" : "Everyone in my team";

/** What the "Send to" picker offers. */
export async function audienceOptions(ctx: Ctx) {
  if (!has(ctx, "announcement:send")) throw new ForbiddenError();
  const people = await reachable(ctx);
  const depts = await Department.find({ _id: { $in: [...new Set(people.map((p) => String(p.departmentId)))] } }).sort({ name: 1 }).lean();
  return {
    everyoneLabel: everyoneLabel(ctx),
    departments: depts.map((d) => ({ id: String(d._id), name: d.name, count: people.filter((p) => String(p.departmentId) === String(d._id)).length })),
    people: people.map((p) => ({ id: String(p._id), name: fullName(p), jobTitle: p.jobTitle, departmentId: String(p.departmentId) })),
  };
}

const ids = z.array(z.string().refine((s) => Types.ObjectId.isValid(s))).default([]);
const SendInput = z
  .object({
    kind: z.enum(["announcement", "meeting"]),
    title: z.string().trim().min(3, "Give it a short title.").max(120),
    body: z.string().trim().min(3, "Write the message.").max(5000),
    audience: z.enum(["everyone", "departments", "people"], { message: "Choose who it's for." }),
    departmentIds: ids,
    employeeIds: ids,
    date: z.string().optional(),
    time: z.string().optional(),
    durationMins: z.coerce.number().int().min(15).max(480).optional(),
    where: z.string().trim().max(200).optional(),
  })
  .superRefine((v, c) => {
    if (v.kind !== "meeting") return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date ?? "")) c.addIssue({ code: "custom", path: ["date"], message: "Choose a date." });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time ?? "")) c.addIssue({ code: "custom", path: ["time"], message: "Choose a time." });
    if (!v.where || v.where.length < 2) c.addIssue({ code: "custom", path: ["where"], message: "Say where (room or video link)." });
  });

export async function sendAnnouncement(ctx: Ctx, input: unknown, now = new Date()) {
  if (!has(ctx, "announcement:send")) throw new ForbiddenError();
  const data = SendInput.parse(input);
  const people = await reachable(ctx);
  const allowed = new Set(people.map((p) => String(p._id)));

  let chosen = people;
  let audienceLabel = everyoneLabel(ctx);
  if (data.audience === "departments") {
    if (!data.departmentIds.length) throw new AppError("Pick at least one department.");
    chosen = people.filter((p) => data.departmentIds.includes(String(p.departmentId)));
    const names = await Department.find({ _id: { $in: data.departmentIds } }).sort({ name: 1 }).lean();
    audienceLabel = names.map((d) => d.name).join(", ");
  } else if (data.audience === "people") {
    if (!data.employeeIds.length) throw new AppError("Pick at least one person.");
    if (data.employeeIds.some((id) => !allowed.has(id))) throw new ForbiddenError("You can only message people you're responsible for.");
    chosen = people.filter((p) => data.employeeIds.includes(String(p._id)));
    audienceLabel = chosen.length === 1 ? fullName(chosen[0]) : `${chosen.length} people`;
  }
  if (!chosen.length) throw new AppError("Nobody matches that choice.");

  let meeting = null;
  if (data.kind === "meeting") {
    const at = new Date(`${data.date}T${data.time}:00+03:00`); // Nairobi time on any server
    if (Number.isNaN(at.getTime())) throw new AppError("That date doesn't exist.");
    if (at <= now) throw new AppError("The meeting must be in the future.");
    meeting = { at, durationMins: data.durationMins ?? 60, where: data.where! };
  }

  const doc = await Announcement.create({
    kind: data.kind,
    title: data.title,
    body: data.body,
    meeting,
    audienceLabel,
    recipientIds: chosen.map((p) => p._id),
    authorUserId: ctx.userId,
    authorEmployeeId: ctx.employee ? new Types.ObjectId(ctx.employee.id) : null,
    authorName: ctx.name,
  });
  await record(ctx, {
    action: `announcement.${data.kind === "meeting" ? "meeting" : "send"}`,
    entity: "announcement",
    entityId: String(doc._id),
    summary: `${data.kind === "meeting" ? "Called a meeting" : "Announced"}: "${data.title}" to ${audienceLabel} (${chosen.length} ${chosen.length === 1 ? "person" : "people"})`,
  });
  await onAnnouncement(doc.toObject());
  return String(doc._id);
}

const visible = (ctx: Ctx) => ({
  $or: [
    { authorUserId: ctx.userId },
    ...(ctx.employee ? [{ recipientIds: new Types.ObjectId(ctx.employee.id) }] : []),
  ],
});

/** What I received and what I sent, newest first. */
export async function listAnnouncements(ctx: Ctx) {
  await connectDB();
  const me = ctx.employee?.id;
  const rows = await Announcement.find(visible(ctx)).sort({ createdAt: -1 }).limit(100).lean();
  return rows.map((a) => ({
    id: String(a._id),
    kind: a.kind,
    title: a.title,
    excerpt: a.body.length > 160 ? `${a.body.slice(0, 160).trim()}…` : a.body,
    meeting: a.meeting,
    authorName: a.authorName,
    createdAt: a.createdAt,
    audienceLabel: a.audienceLabel,
    mine: a.authorUserId === ctx.userId,
    unread: !!me && a.recipientIds.some((r) => String(r) === me) && !a.readBy.some((r) => String(r) === me),
    seen: a.readBy.length,
    total: a.recipientIds.length,
  }));
}

export async function unreadAnnouncements(ctx: Ctx) {
  if (!ctx.employee) return 0;
  await connectDB();
  const me = new Types.ObjectId(ctx.employee.id);
  return Announcement.countDocuments({ recipientIds: me, readBy: { $ne: me } });
}

/** Open one: marks it read for a recipient; the sender sees who has and hasn't read it. */
export async function getAnnouncement(ctx: Ctx, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Announcement");
  await connectDB();
  const a = await Announcement.findOne({ $and: [{ _id: id }, visible(ctx)] }).lean();
  if (!a) throw new NotFoundError("Announcement");
  const me = ctx.employee?.id;
  if (me && a.recipientIds.some((r) => String(r) === me) && !a.readBy.some((r) => String(r) === me)) {
    await Announcement.updateOne({ _id: a._id }, { $addToSet: { readBy: new Types.ObjectId(me) } });
  }
  const mine = a.authorUserId === ctx.userId;
  let readers: { name: string; seen: boolean }[] = [];
  if (mine) {
    const people = await Employee.find({ _id: { $in: a.recipientIds } }).select("firstName lastName").sort({ firstName: 1 }).lean();
    const seen = new Set(a.readBy.map(String));
    readers = people.map((p) => ({ name: fullName(p), seen: seen.has(String(p._id)) })).sort((x, y) => Number(x.seen) - Number(y.seen));
  }
  return {
    id: String(a._id), kind: a.kind, title: a.title, body: a.body, meeting: a.meeting,
    authorName: a.authorName, createdAt: a.createdAt, audienceLabel: a.audienceLabel,
    mine, readers, seen: readers.filter((r) => r.seen).length, total: a.recipientIds.length,
  };
}
