import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Users, ScrollText, ShieldAlert } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Role } from "@/server/models/Role";
import { AuditLog } from "@/server/models/AuditLog";
import { AccessTable } from "@/components/AccessTable";
import { PageHeader, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-KE", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireCtx();
  await connectDB();

  const me = await User.findById(ctx.userId).select("roleIds extraGrants").lean();
  const roles = await Role.find({ _id: { $in: me?.roleIds ?? [] } }).select("name grants").lean();
  const sources = [
    ...roles.map((r) => ({ name: r.name, grants: r.grants })),
    ...(me?.extraGrants.length ? [{ name: "Granted directly", grants: me.extraGrants }] : []),
  ];

  const canUsers = has(ctx, "user:read");
  const canAudit = has(ctx, "audit:read");
  const [activeUsers, roleCount, recent] = await Promise.all([
    canUsers ? User.countDocuments({ status: "active" }) : null,
    canUsers ? Role.countDocuments() : null,
    canAudit ? AuditLog.find().sort({ seq: -1 }).limit(6).lean() : null,
  ]);

  return (
    <>
      <PageHeader title={`${greeting()}, ${ctx.name.split(" ")[0]}`} subtitle={`Signed in as ${ctx.roleNames.join(", ")}`} />

      {(canUsers || canAudit) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {activeUsers !== null && <Stat icon={Users} label="Active accounts" value={activeUsers} href="/admin/users" />}
          {roleCount !== null && <Stat icon={ShieldCheck} label="Roles" value={roleCount} href={has(ctx, "role:manage") ? "/admin/roles" : undefined} />}
          {recent && <Stat icon={ScrollText} label="Audit entries" value={recent[0]?.seq ?? 0} href="/admin/audit" />}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card overflow-hidden">
          <div className="border-b border-stone-200 px-4 py-3">
            <h2 className="font-semibold">Your access</h2>
            <p className="text-sm text-stone-500">What you can do in Kilele HR, and which role gives it to you.</p>
          </div>
          <AccessTable sources={sources} />
        </section>

        {recent && (
          <section className="card self-start overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <h2 className="font-semibold">Recent activity</h2>
              <Link href="/admin/audit" className="text-sm text-brand-700 hover:underline">Audit trail →</Link>
            </div>
            <ul className="divide-y divide-stone-100">
              {recent.map((e) => (
                <li key={e.seq} className="flex gap-3 px-4 py-3 text-sm">
                  {e.action.startsWith("auth.login_failed") || e.action === "auth.locked" ? (
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  ) : (
                    <ScrollText className="mt-0.5 size-4 shrink-0 text-stone-400" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{e.actorName}</span> · {e.summary}
                    </p>
                    <p className="text-xs text-stone-500">{fmtDateTime(e.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value, href }: { icon: typeof Users; label: string; value: number; href?: string }) {
  const body = (
    <div className="card flex items-center gap-4 p-4 transition-colors hover:border-brand-300">
      <span className="rounded-lg bg-brand-50 p-2.5 text-brand-700">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-stone-500">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
