import { Types } from "mongoose";
import { z } from "zod";
import { connectDB, withTransaction } from "@/lib/db";
import { countLeaveDays, kenyanHolidays, parseISODate, toISODate, type Holiday } from "@/lib/leaveDays";
import { Employee, type EmployeeRecord } from "../models/Employee";
import { LeaveAdjustment, LeaveRequest, LeaveType, PublicHoliday, type LeaveRequestRecord, type LeaveTypeRecord } from "../models/Leave";
import { nextNumber } from "../models/Counter";
import { authorize, can, hasScope, scopeFilter } from "../authz";
import { record } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { cancelWorkflow, decisionRight, startWorkflow, subjectOf, type WorkflowDef } from "../workflow";
import type { Ctx } from "../context";

/** Line manager first, then HR (anyone with leave:approve at "all" scope). */
export const LEAVE_WORKFLOW: WorkflowDef = {
  steps: [
    { key: "manager", label: "Line manager", approver: { kind: "manager", perm: "leave:approve" } },
    { key: "hr", label: "HR", approver: { kind: "permission", perm: "leave:approve", scope: "all" } },
  ],
  distinctApprovers: false,
};

type Stored = EmployeeRecord & { _id: Types.ObjectId };
type LeaveDoc = LeaveRequestRecord & { _id: Types.ObjectId };

/** Fields mapping so scopeFilter() works on leave requests (they carry a copy of the employee's scope fields). */
const LEAVE_SCOPE = { id: "workflow.subject.employeeId", departmentId: "workflow.subject.departmentId", managerPath: "workflow.subject.managerPath" };

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

export async function holidaysFor(years: number[]): Promise<Holiday[]> {
  await connectDB();
  const extra = await PublicHoliday.find().lean();
  return years.flatMap((y) => kenyanHolidays(y, extra.map((h) => ({ date: h.date, name: h.name }))));
}

function today(now: Date) {
  // Calendar date in Nairobi (UTC+3), whatever the server's timezone.
  return toISODate(new Date(now.getTime() + 3 * 3_600_000));
}

function monthsOfService(hire: Date, onISO: string) {
  const on = parseISODate(onISO);
  return (on.getUTCFullYear() - hire.getUTCFullYear()) * 12 + (on.getUTCMonth() - hire.getUTCMonth()) - (on.getUTCDate() < hire.getUTCDate() ? 1 : 0);
}

function eligible(t: LeaveTypeRecord, e: Pick<Stored, "gender">) {
  return t.active && (t.gender === "any" || t.gender === e.gender);
}

// ---------------------------------------------------------------------------
// Balances: always computed, never stored
// ---------------------------------------------------------------------------

export type Balance = {
  code: string;
  name: string;
  dayCount: "working" | "calendar";
  entitlement: number;
  carriedOver: number;
  adjustments: number;
  taken: number;
  pending: number;
  available: number;
};

function entitlementFor(t: LeaveTypeRecord, hireDate: Date, year: number) {
  const hireYear = hireDate.getUTCFullYear();
  if (hireYear > year) return 0;
  if (!t.proRata || hireYear < year) return t.daysPerYear;
  // Joined during this year: a share for the months left, rounded to half days.
  const months = 12 - hireDate.getUTCMonth();
  return Math.round(((t.daysPerYear * months) / 12) * 2) / 2;
}

export async function balancesFor(employee: Pick<Stored, "_id" | "gender" | "hireDate">, year: number): Promise<Balance[]> {
  await connectDB();
  const [types, requests, adjustments] = await Promise.all([
    LeaveType.find({ active: true }).sort({ order: 1 }).lean(),
    LeaveRequest.find({ employeeId: employee._id, year: { $in: [year, year - 1] }, "workflow.status": { $in: ["pending", "approved"] } })
      .select("typeCode year days workflow.status")
      .lean(),
    LeaveAdjustment.find({ employeeId: employee._id, year: { $in: [year, year - 1] } }).lean(),
  ]);
  const sum = (xs: { days: number }[]) => xs.reduce((s, x) => s + x.days, 0);

  return types
    .filter((t) => eligible(t, employee))
    .map((t) => {
      const mine = requests.filter((r) => r.typeCode === t.code);
      const adj = (y: number) => sum(adjustments.filter((a) => a.typeCode === t.code && a.year === y));
      const approved = (y: number) => sum(mine.filter((r) => r.year === y && r.workflow.status === "approved"));

      let carriedOver = 0;
      if (t.carryOverMax > 0) {
        const lastYearLeft = entitlementFor(t, employee.hireDate, year - 1) + adj(year - 1) - approved(year - 1);
        carriedOver = Math.max(0, Math.min(t.carryOverMax, lastYearLeft));
      }
      const entitlement = entitlementFor(t, employee.hireDate, year);
      const taken = approved(year);
      const pending = sum(mine.filter((r) => r.year === year && r.workflow.status === "pending"));
      const adjusted = adj(year);
      return {
        code: t.code,
        name: t.name,
        dayCount: t.dayCount,
        entitlement,
        carriedOver,
        adjustments: adjusted,
        taken,
        pending,
        available: entitlement + carriedOver + adjusted - taken - pending,
      };
    });
}

// ---------------------------------------------------------------------------
// Applying and cancelling
// ---------------------------------------------------------------------------

const isoDate = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

const ApplyInput = z.object({
  typeCode: z.string().min(1, "Choose a type of leave."),
  start: isoDate("Choose a start date."),
  end: isoDate("Choose an end date."),
  reason: z.string().trim().max(500).default(""),
  handoverTo: z.string().trim().max(120).default(""),
});

/** `now` is injectable so tests and the demo seed can apply "in the past". */
export async function applyLeave(ctx: Ctx, input: unknown, now = new Date()) {
  authorize(ctx, "leave:apply");
  if (!ctx.employee) throw new AppError("Only employees can apply for leave.");
  const data = ApplyInput.parse(input);
  await connectDB();

  const [type, me] = await Promise.all([
    LeaveType.findOne({ code: data.typeCode.toUpperCase(), active: true }).lean(),
    Employee.findById(ctx.employee.id).lean<Stored>(),
  ]);
  if (!type) throw new AppError("Choose a type of leave.");
  if (!me || me.status === "separated") throw new AppError("Your employee record isn't active.");
  if (!eligible(type, me)) throw new AppError(`${type.name} isn't available to you.`);

  if (data.end < data.start) throw new AppError("The end date is before the start date.");
  const t = today(now);
  const earliest = toISODate(new Date(parseISODate(t).getTime() - type.backdateDays * 86_400_000));
  if (data.start < earliest) {
    throw new AppError(type.backdateDays ? `${type.name} can start at most ${type.backdateDays} days ago.` : "Leave can't start in the past.");
  }
  const year = Number(data.start.slice(0, 4));
  if (Number(data.end.slice(0, 4)) !== year) throw new AppError("Leave can't cross into a new year. Split it into two requests.");
  if (year > Number(t.slice(0, 4)) + 1) throw new AppError("You can only apply up to next year.");
  if (monthsOfService(me.hireDate, data.start) < type.minServiceMonths) {
    throw new AppError(`${type.name} is available after ${type.minServiceMonths} months of service.`);
  }

  const holidays = (await holidaysFor([year])).map((h) => h.date);
  const days = countLeaveDays(data.start, data.end, type.dayCount, holidays);
  if (days <= 0) throw new AppError("Those dates are all weekends or public holidays: nothing to take.");

  const leave = await withTransaction(async (session) => {
    // One write to a per-employee lock document: two applications from the
    // same person at the same moment now conflict, and the second one re-runs
    // these checks with the first one counted. No double-spending of days.
    await nextNumber(`leave-lock:${me._id}`, session);

    const clash = await LeaveRequest.findOne({
      employeeId: me._id,
      "workflow.status": { $in: ["pending", "approved"] },
      start: { $lte: data.end },
      end: { $gte: data.start },
    })
      .session(session)
      .lean();
    if (clash) throw new AppError(`You already have ${clash.typeName.toLowerCase()} (${clash.number}) on some of these days.`);

    const balance = (await balancesFor(me, year)).find((b) => b.code === type.code)!;
    if (days > balance.available) {
      throw new AppError(`That's ${days} days, but you have ${balance.available} ${type.name.toLowerCase()} days left for ${year}.`);
    }

    const number = `LV-${year}-${String(await nextNumber(`leave-${year}`, session)).padStart(4, "0")}`;
    const workflow = await startWorkflow(LEAVE_WORKFLOW, me, ctx, now);
    const [doc] = await LeaveRequest.create(
      [
        {
          number,
          employeeId: me._id,
          employeeName: `${me.firstName} ${me.lastName}`,
          typeCode: type.code,
          typeName: type.name,
          start: data.start,
          end: data.end,
          days,
          year,
          reason: data.reason,
          handoverTo: data.handoverTo,
          workflow,
        },
      ],
      { session },
    );
    return doc;
  });

  await record(ctx, {
    action: "leave.apply",
    entity: "leave",
    entityId: String(leave._id),
    summary: `Applied for ${days} days of ${type.name.toLowerCase()} (${leave.number}), ${data.start} to ${data.end}`,
  });
  return String(leave._id);
}

export async function cancelLeave(ctx: Ctx, id: string, reason: string, now = new Date()) {
  const doc = await loadLeave(id);
  const own = ctx.employee?.id === String(doc.employeeId);
  const hr = hasScope(ctx, "leave:approve", "all");
  if (!own && !hr) throw new ForbiddenError();
  const wf = doc.workflow;
  if (wf.status === "approved" && doc.start <= today(now)) {
    throw new AppError("This leave has already started. Ask HR to adjust the balance instead.");
  }
  if (!own && reason.trim().length < 3) throw new AppError("Give a reason for cancelling someone else's leave.");
  try {
    cancelWorkflow(ctx, wf, reason.trim() || "Cancelled by the employee", now);
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  const res = await LeaveRequest.updateOne({ _id: doc._id, "workflow.status": { $in: ["pending", "approved"] } }, { $set: { workflow: wf } });
  if (!res.modifiedCount) throw new AppError("This request changed while you were looking at it. Refresh and try again.");
  await record(ctx, {
    action: "leave.cancel",
    entity: "leave",
    entityId: id,
    summary: `Cancelled ${doc.employeeName}'s ${doc.typeName.toLowerCase()} (${doc.number})`,
    reason: reason || undefined,
  });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function loadLeave(id: string): Promise<LeaveDoc> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Leave request");
  await connectDB();
  const doc = await LeaveRequest.findById(id).lean<LeaveDoc>();
  if (!doc) throw new NotFoundError("Leave request");
  return doc;
}

/** Own requests, anything within leave:read scope, and anything waiting for your decision. */
function canSee(ctx: Ctx, doc: LeaveDoc) {
  return ctx.employee?.id === String(doc.employeeId) || can(ctx, "leave:read", subjectOf(doc.workflow)) || decisionRight(ctx, doc.workflow).ok;
}

export async function myLeave(ctx: Ctx, now = new Date()) {
  authorize(ctx, "leave:apply");
  if (!ctx.employee) throw new AppError("Only employees have leave.");
  await connectDB();
  const me = await Employee.findById(ctx.employee.id).lean<Stored>();
  if (!me) throw new NotFoundError("Employee");
  const year = Number(today(now).slice(0, 4));
  const [balances, requests, holidays, types] = await Promise.all([
    balancesFor(me, year),
    LeaveRequest.find({ employeeId: me._id }).sort({ start: -1 }).limit(50).lean<LeaveDoc[]>(),
    holidaysFor([year, year + 1]),
    LeaveType.find({ active: true }).sort({ order: 1 }).lean(),
  ]);
  return {
    year,
    today: today(now),
    balances,
    nextYear: await balancesFor(me, year + 1),
    requests,
    holidays,
    types: types.filter((t) => eligible(t, me)).map((t) => ({ code: t.code, name: t.name, dayCount: t.dayCount, backdateDays: t.backdateDays, description: t.description })),
  };
}

export async function getLeave(ctx: Ctx, id: string) {
  const doc = await loadLeave(id);
  if (!canSee(ctx, doc)) throw new ForbiddenError();
  const right = decisionRight(ctx, doc.workflow);
  const own = ctx.employee?.id === String(doc.employeeId);

  // What an approver needs to decide well: the balance, and who else is away then.
  let balance: Balance | null = null;
  let alsoAway: { name: string; start: string; end: string; status: string }[] = [];
  if (right.ok || own || can(ctx, "leave:read", subjectOf(doc.workflow))) {
    const emp = await Employee.findById(doc.employeeId).lean<Stored>();
    if (emp) balance = (await balancesFor(emp, doc.year)).find((b) => b.code === doc.typeCode) ?? null;
    const others = await LeaveRequest.find({
      _id: { $ne: doc._id },
      "workflow.subject.departmentId": doc.workflow.subject.departmentId,
      "workflow.status": { $in: ["pending", "approved"] },
      start: { $lte: doc.end },
      end: { $gte: doc.start },
    })
      .select("employeeName start end workflow.status")
      .lean();
    alsoAway = others.map((o) => ({ name: o.employeeName, start: o.start, end: o.end, status: o.workflow.status }));
  }

  const now = new Date();
  return {
    doc,
    own,
    canDecide: right.ok,
    whyNot: right.ok ? null : right.why,
    canCancel:
      (own || hasScope(ctx, "leave:approve", "all")) &&
      (doc.workflow.status === "pending" || (doc.workflow.status === "approved" && doc.start > today(now))),
    balance,
    alsoAway,
  };
}

/** Requests overlapping a date range that this person may see (team calendar, HR list). */
export async function teamLeave(ctx: Ctx, from: string, to: string) {
  const scope = scopeFilter(ctx, "leave:read", LEAVE_SCOPE);
  if (!scope) throw new ForbiddenError();
  await connectDB();
  const docs = await LeaveRequest.find({
    $and: [scope, { "workflow.status": { $in: ["pending", "approved"] }, start: { $lte: to }, end: { $gte: from } }],
  })
    .sort({ start: 1 })
    .lean<LeaveDoc[]>();
  return docs;
}

export async function offToday(ctx: Ctx, now = new Date()) {
  if (!scopeFilter(ctx, "leave:read", LEAVE_SCOPE)) return null;
  const t = today(now);
  return (await teamLeave(ctx, t, t)).filter((d) => d.workflow.status === "approved");
}

// ---------------------------------------------------------------------------
// Settings (leave:manage)
// ---------------------------------------------------------------------------

export async function leaveSettings(ctx: Ctx) {
  authorize(ctx, "leave:manage");
  await connectDB();
  const year = new Date().getUTCFullYear();
  const [types, extra] = await Promise.all([LeaveType.find().sort({ order: 1 }).lean(), PublicHoliday.find().sort({ date: 1 }).lean()]);
  return {
    types,
    extra: extra.map((h) => ({ id: String(h._id), date: h.date, name: h.name })),
    holidays: await holidaysFor([year, year + 1]),
  };
}

const TypeInput = z.object({
  daysPerYear: z.coerce.number().min(0).max(366),
  carryOverMax: z.coerce.number().min(0).max(60),
  minServiceMonths: z.coerce.number().int().min(0).max(60),
  backdateDays: z.coerce.number().int().min(0).max(60),
  active: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export async function updateLeaveType(ctx: Ctx, code: string, input: unknown) {
  authorize(ctx, "leave:manage");
  const data = TypeInput.parse(input);
  await connectDB();
  const t = await LeaveType.findOne({ code });
  if (!t) throw new NotFoundError("Leave type");
  const fields = ["daysPerYear", "carryOverMax", "minServiceMonths", "backdateDays", "active"] as const;
  const changes = fields
    .filter((f) => String(t[f]) !== String(data[f]))
    .map((f) => ({ field: f, from: String(t[f]), to: String(data[f]) }));
  if (!changes.length) return;
  Object.assign(t, data);
  await t.save();
  await record(ctx, { action: "leave.type.update", entity: "leaveType", entityId: code, summary: `Changed the ${t.name} policy`, changes });
}

const HolidayInput = z.object({
  date: isoDate("Choose a date."),
  name: z.string().trim().min(3, "Name the holiday.").max(80),
});

export async function addHoliday(ctx: Ctx, input: unknown) {
  authorize(ctx, "leave:manage");
  const data = HolidayInput.parse(input);
  await connectDB();
  if (await PublicHoliday.exists({ date: data.date })) throw new AppError("There's already a holiday on that date.");
  await PublicHoliday.create(data);
  await record(ctx, { action: "leave.holiday.add", summary: `Added public holiday ${data.name} on ${data.date}` });
}

export async function removeHoliday(ctx: Ctx, id: string) {
  authorize(ctx, "leave:manage");
  await connectDB();
  const h = await PublicHoliday.findByIdAndDelete(id).lean();
  if (h) await record(ctx, { action: "leave.holiday.remove", summary: `Removed public holiday ${h.name} on ${h.date}` });
}

const AdjustInput = z.object({
  employeeId: z.string().refine((s) => Types.ObjectId.isValid(s), "Pick an employee."),
  typeCode: z.string().min(1),
  days: z.coerce.number().refine((n) => n !== 0 && Math.abs(n) <= 30, "Between -30 and 30, not 0."),
  reason: z.string().trim().min(5, "Say why."),
});

export async function adjustBalance(ctx: Ctx, input: unknown, now = new Date()) {
  authorize(ctx, "leave:manage");
  const data = AdjustInput.parse(input);
  await connectDB();
  const emp = await Employee.findById(data.employeeId).lean<Stored>();
  if (!emp) throw new NotFoundError("Employee");
  authorize(ctx, "leave:read", emp);
  if (ctx.employee?.id === data.employeeId) throw new AppError("You can't adjust your own balance.");
  const year = Number(today(now).slice(0, 4));
  await LeaveAdjustment.create({ ...data, typeCode: data.typeCode.toUpperCase(), year, byName: ctx.name });
  await record(ctx, {
    action: "leave.adjust",
    entity: "employee",
    entityId: data.employeeId,
    summary: `Adjusted ${emp.firstName} ${emp.lastName}'s ${data.typeCode} balance by ${data.days > 0 ? "+" : ""}${data.days} days`,
    reason: data.reason,
  });
}
