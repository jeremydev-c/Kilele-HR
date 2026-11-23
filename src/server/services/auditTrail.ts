import { connectDB } from "@/lib/db";
import { decrypt, mask } from "@/lib/crypto";
import { AuditLog } from "../models/AuditLog";
import { authorize, hasScope } from "../authz";
import { record, verifyChain, type SecretKind } from "../audit";
import { PII_LABELS } from "../employeeView";
import type { Ctx } from "../context";

export const PAGE_SIZE = 50;

export const AUDIT_CATEGORIES = {
  auth: "Sign-ins",
  user: "User accounts",
  role: "Roles",
  employee: "Employees",
  leave: "Leave",
  recruitment: "Recruitment",
  promotion: "Promotions",
  separation: "Separation",
  audit: "Audit checks",
} as const;

const FIELD_LABELS: Record<string, string> = {
  ...PII_LABELS,
  firstName: "First name", lastName: "Last name", otherNames: "Other names", gender: "Gender",
  workEmail: "Work email", jobTitle: "Job title", departmentId: "Department", manager: "Manager",
  employmentType: "Employment type", status: "Status", grade: "Grade", basicSalary: "Basic salary",
  personalEmail: "Personal email", phone: "Phone", address: "Address", town: "Town", county: "County",
  kinName: "Next of kin", kinRelationship: "Next of kin: relationship", kinPhone: "Next of kin: phone",
  emergencyName: "Emergency contact", emergencyRelationship: "Emergency contact: relationship", emergencyPhone: "Emergency contact: phone",
  nextOfKin: "Next of kin", emergencyContact: "Emergency contact",
  daysPerYear: "Days per year", carryOverMax: "Most days carried over", minServiceMonths: "Months of service needed",
  backdateDays: "Days it can be backdated", active: "Active", roles: "Roles", name: "Name", description: "Description",
};
const label = (f: string) => FIELD_LABELS[f] ?? f.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** One change as this viewer may see it. `hidden` explains a value they're not allowed to read. */
export type ShownChange = { label: string; from: string | null; to: string | null; hidden?: string };

/**
 * Sensitive values are stored encrypted and opened here, per viewer:
 *  - IDs, KRA PIN, bank and other statutory details: always masked (••••5678).
 *    Seeing a full ID needs a stated reason on the employee page; the log is no back door.
 *  - Contact details: in full for people who may read everyone's contact details, masked otherwise.
 *  - Pay: in full for people who may read everyone's pay, hidden otherwise.
 */
function showChange(ctx: Ctx, c: { field?: string | null; from?: string | null; to?: string | null; kind?: string | null }): ShownChange {
  const field = c.field ?? "";
  const kind = c.kind as SecretKind | undefined;
  if (!kind) return { label: label(field), from: c.from ?? null, to: c.to ?? null };

  const full = kind === "contact" ? hasScope(ctx, "employee.contact:read", "all") : kind === "pay" ? hasScope(ctx, "employee.pay:read", "all") : false;
  if (kind === "pay" && !full) return { label: label(field), from: null, to: null, hidden: "Hidden: needs access to everyone's pay" };
  const open = (v?: string | null) => {
    if (!v) return "(empty)";
    let plain: string;
    try { plain = decrypt(v); } catch { return "(can't be read)"; }
    if (kind === "pay") return `KES ${Number(plain).toLocaleString("en-KE")}`;
    return full ? plain : mask(plain, kind === "pii" ? 4 : 3);
  };
  return { label: label(field), from: open(c.from), to: open(c.to) };
}

export async function listAudit(ctx: Ctx, opts: { q?: string; category?: string; page?: number }) {
  authorize(ctx, "audit:read");
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (opts.category && opts.category in AUDIT_CATEGORIES) filter.action = { $regex: `^${opts.category}\\.` };
  if (opts.q) {
    const rx = { $regex: opts.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = [{ summary: rx }, { actorName: rx }, { action: rx }];
  }
  const page = Math.max(1, opts.page ?? 1);
  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ seq: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return {
    entries: entries.map((e) => ({ ...e, changes: (e.changes ?? []).map((c) => showChange(ctx, c)) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Recompute the whole hash chain. The check itself is logged too. */
export async function checkChain(ctx: Ctx) {
  authorize(ctx, "audit:read");
  const report = await verifyChain();
  await record(ctx, {
    action: "audit.verify",
    summary: report.ok
      ? `Verified the audit chain: ${report.checked} entries intact`
      : `Audit chain BROKEN at entry #${report.brokenAt}: ${report.problem}`,
  });
  return report;
}
