import { connectDB } from "@/lib/db";
import { AuditLog } from "../models/AuditLog";
import { authorize } from "../authz";
import { record, verifyChain } from "../audit";
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
  return { entries, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
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
