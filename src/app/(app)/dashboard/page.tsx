import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarPlus, CheckCircle2, ClipboardCheck, Inbox, MessageSquareText, Plane, Plus, ShieldAlert, ScrollText, UserPlus,
} from "lucide-react";
import { Employee } from "@/server/models/Employee";
import { AuditLog } from "@/server/models/AuditLog";
import { LeaveRequest } from "@/server/models/Leave";
import { inboxCount } from "@/server/services/approvals";
import { balancesFor, offToday } from "@/server/services/leave";
import { hrOverview } from "@/server/services/dashboard";
import { myInterviews } from "@/server/services/recruitment";
import { listSeparations } from "@/server/services/separations";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { connectDB } from "@/lib/db";
import { ListRow, SectionTitle, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Home" };

function today() {
  const now = new Date();
  const h = Number(new Intl.DateTimeFormat("en-KE", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(now));
  return {
    greeting: h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
    date: new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Nairobi" }).format(now),
  };
}

export default async function HomePage() {
  const ctx = await requireCtx();
  await connectDB();
  const { greeting, date } = today();
  const me = ctx.employee && has(ctx, "leave:apply") ? await Employee.findById(ctx.employee.id).lean() : null;

  const [waiting, interviews, exits, myPending, away, org, balances, recent] = await Promise.all([
    inboxCount(ctx),
    myInterviews(ctx),
    listSeparations(ctx),
    me ? LeaveRequest.countDocuments({ employeeId: me._id, "workflow.status": "pending" }) : 0,
    offToday(ctx),
    hrOverview(ctx),
    me ? balancesFor(me, new Date().getUTCFullYear()) : null,
    has(ctx, "audit:read") ? AuditLog.find().sort({ seq: -1 }).limit(5).lean() : null,
  ]);
  const scorecards = interviews.filter((i) => i.needsScorecard).length;
  const annual = balances?.find((b) => b.code === "ANNUAL");

  // Things only this person can move forward, most urgent first.
  const tasks = [
    waiting > 0 && { href: "/approvals", icon: Inbox, text: `${waiting} request${waiting === 1 ? "" : "s"} waiting for your approval` },
    scorecards > 0 && { href: "/recruitment", icon: MessageSquareText, text: `${scorecards} interview scorecard${scorecards === 1 ? "" : "s"} to submit` },
    exits.clearanceTasks.length > 0 && { href: "/separations", icon: ClipboardCheck, text: `${exits.clearanceTasks.length} exit clearance item${exits.clearanceTasks.length === 1 ? "" : "s"} to sign` },
    myPending > 0 && { href: "/leave", icon: CalendarPlus, text: myPending === 1 ? "Your leave request is awaiting approval" : `${myPending} of your leave requests are awaiting approval` },
  ].filter(Boolean) as { href: string; icon: typeof Inbox; text: string }[];

  const quick = [
    me && { href: "/leave", icon: CalendarPlus, label: "Apply for leave" },
    has(ctx, "employee:create") && { href: "/people/new", icon: UserPlus, label: "Add employee" },
    has(ctx, "requisition:create") && ctx.employee && { href: "/recruitment/requisitions/new", icon: Plus, label: "Request a hire" },
  ].filter(Boolean) as { href: string; icon: typeof Inbox; label: string }[];

  return (
    <>
      <header className="mb-8">
        <p className="text-[13px] font-medium text-stone-500">{date}</p>
        <h1 className="mt-0.5 text-[32px] leading-tight font-semibold">{greeting}, {ctx.name.split(" ")[0]}</h1>
      </header>

      <div className="grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-8">
          <section>
            <SectionTitle>For you</SectionTitle>
            <div className="card divide-y divide-stone-100 overflow-hidden">
              {tasks.length ? (
                tasks.map((t) => (
                  <ListRow key={t.href} href={t.href}>
                    <span className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-brand-50 text-brand-700"><t.icon className="size-4" /></span>
                      <span className="font-medium">{t.text}</span>
                    </span>
                  </ListRow>
                ))
              ) : (
                <p className="flex items-center gap-3 px-4 py-5 text-stone-500">
                  <CheckCircle2 className="size-5 text-brand-600" /> You&apos;re all caught up.
                </p>
              )}
            </div>
          </section>

          {quick.length > 0 && (
            <section className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <Link key={q.href} href={q.href} className="btn-secondary h-10">
                  <q.icon className="size-4 text-brand-700" /> {q.label}
                </Link>
              ))}
            </section>
          )}

          {org && (
            <section>
              <SectionTitle>Company</SectionTitle>
              <div className="card p-5">
                <dl className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                  {[
                    ["People", org.headcount, "/people"],
                    ["Joined", org.joiners, "/people"],
                    ["Left", org.leavers, "/people?status=separated"],
                    ["Probation", org.onProbation, "/people?status=probation"],
                    ["Open jobs", org.vacancies, "/recruitment"],
                    ["Leaving", org.exits, "/separations"],
                  ].map(([label, n, href]) => (
                    <Link key={label as string} href={href as string} className="group">
                      <dd className="text-2xl font-semibold tabular-nums group-hover:text-brand-700">{n}</dd>
                      <dt className="text-xs text-stone-500">{label}</dt>
                    </Link>
                  ))}
                </dl>
                <ul className="mt-6 space-y-2 border-t border-stone-100 pt-5">
                  {org.departments.map((d) => (
                    <li key={d.name} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-sm">
                      <span className="truncate text-stone-600">{d.name}</span>
                      <span className="h-2 rounded-full bg-stone-100">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(d.n / org.departments[0].n) * 100}%` }} />
                      </span>
                      <span className="text-right font-medium tabular-nums">{d.n}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-stone-400">Headcount by department. Joined and left count this year.</p>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-8">
          {(annual || away) && (
            <section className="grid grid-cols-2 gap-3">
              {annual && (
                <Link href="/leave" className="card p-4 hover:border-brand-300">
                  <p className="text-[13px] text-stone-500">Annual leave</p>
                  <p className="mt-1 text-[28px] leading-none font-semibold tabular-nums">{annual.available}</p>
                  <p className="mt-1 text-xs text-stone-500">days left</p>
                </Link>
              )}
              {away && (
                <Link href="/leave/calendar" className="card p-4 hover:border-brand-300">
                  <p className="flex items-center gap-1.5 text-[13px] text-stone-500"><Plane className="size-3.5" /> Away today</p>
                  <p className="mt-1 text-[28px] leading-none font-semibold tabular-nums">{away.length}</p>
                  <p className="mt-1 truncate text-xs text-stone-500">{away.map((a) => a.employeeName.split(" ")[0]).join(", ") || "Everyone's in"}</p>
                </Link>
              )}
            </section>
          )}

          {recent && (
            <section>
              <SectionTitle action={<Link href="/admin/audit" className="text-[13px] text-brand-700 hover:underline">Audit log</Link>}>
                Recent activity
              </SectionTitle>
              <ul className="card divide-y divide-stone-100 overflow-hidden">
                {recent.map((e) => (
                  <li key={e.seq} className="flex gap-3 px-4 py-3 text-sm">
                    {/failed|locked|denied/.test(e.action) ? (
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    ) : (
                      <ScrollText className="mt-0.5 size-4 shrink-0 text-stone-300" />
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2"><span className="font-medium">{e.actorName}</span> <span className="text-stone-600">{e.summary.charAt(0).toLowerCase() + e.summary.slice(1)}</span></p>
                      <p className="text-xs text-stone-400">{fmtDateTime(e.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
