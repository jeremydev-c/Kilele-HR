import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { holidaysFor, teamLeave } from "@/server/services/leave";
import { LeaveType } from "@/server/models/Leave";
import { connectDB } from "@/lib/db";
import { isWeekend, parseISODate, toISODate } from "@/lib/leaveDays";
import { Empty, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Leave calendar" };

const TYPE_COLORS: Record<string, string> = {
  ANNUAL: "bg-stone-900",
  SICK: "bg-rose-400",
  MATERNITY: "bg-violet-500",
  PATERNITY: "bg-sky-500",
  COMPASSIONATE: "bg-amber-500",
  STUDY: "bg-teal-500",
};

function monthBounds(m?: string) {
  const now = new Date(Date.now() + 3 * 3_600_000);
  const [y, mo] = m && /^\d{4}-\d{2}$/.test(m) ? m.split("-").map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const last = new Date(Date.UTC(y, mo, 0));
  const shift = (n: number) => toISODate(new Date(Date.UTC(y, mo - 1 + n, 1))).slice(0, 7);
  return { y, mo, first: toISODate(first), last: toISODate(last), days: last.getUTCDate(), prev: shift(-1), next: shift(1), today: toISODate(now) };
}

export default async function LeaveCalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await requireCtx();
  const { m } = await searchParams;
  const b = monthBounds(m);
  await connectDB();
  const [requests, holidays, calendarCodes] = await Promise.all([
    load(teamLeave(ctx, b.first, b.last)),
    holidaysFor([b.y]),
    LeaveType.distinct("code", { dayCount: "calendar" }),
  ]);
  const calendarTypes = new Set<string>(calendarCodes);
  const holidayOn = new Map(holidays.map((h) => [h.date, h.name]));
  const dates = Array.from({ length: b.days }, (_, i) => toISODate(new Date(Date.UTC(b.y, b.mo - 1, i + 1))));
  const todayISO = b.today;

  // One row per person, with all their requests this month.
  const rows = new Map<string, { name: string; id: string; reqs: typeof requests }>();
  for (const r of requests) {
    const key = String(r.employeeId);
    if (!rows.has(key)) rows.set(key, { name: r.employeeName, id: key, reqs: [] });
    rows.get(key)!.reqs.push(r);
  }
  const people = [...rows.values()].sort((a, c) => a.name.localeCompare(c.name));
  const monthName = new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric", timeZone: "UTC" }).format(parseISODate(b.first));

  return (
    <>
      <PageHeader
        title="Who's away"
        actions={
          <div className="flex items-center gap-1">
            <Link href={`?m=${b.prev}`} className="btn-secondary px-2" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
            <span className="w-36 text-center text-sm font-medium">{monthName}</span>
            <Link href={`?m=${b.next}`} className="btn-secondary px-2" aria-label="Next month"><ChevronRight className="size-4" /></Link>
          </div>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-36 border-b border-stone-200 bg-white px-3 py-2 text-left font-semibold text-stone-500">Person</th>
              {dates.map((d) => {
                const day = parseISODate(d);
                const off = isWeekend(day) || holidayOn.has(d);
                return (
                  <th
                    key={d}
                    title={holidayOn.get(d)}
                    className={`border-b border-stone-200 px-0 py-1 text-center font-medium ${off ? "bg-stone-100 text-stone-400" : "text-stone-600"} ${d === todayISO ? "text-brand-700 underline" : ""}`}
                  >
                    <span className="block">{"SMTWTFS"[day.getUTCDay()]}</span>
                    {day.getUTCDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 border-b border-stone-100 bg-white px-3 py-1.5">
                  <Link href={`/people/${p.id}`} className="hover:underline">{p.name}</Link>
                </td>
                {dates.map((d) => {
                  const off = isWeekend(parseISODate(d)) || holidayOn.has(d);
                  // Weekends and holidays inside working-day leave aren't leave days, so they stay blank.
                  const r = p.reqs.find((x) => x.start <= d && x.end >= d && (!off || calendarTypes.has(x.typeCode)));
                  return (
                    <td key={d} className={`border-b border-stone-100 p-0.5 ${off ? "bg-stone-50" : ""}`}>
                      {r && (
                        <Link
                          href={`/leave/${r._id}`}
                          title={`${r.typeName} · ${r.number}${r.workflow.status === "pending" ? " (awaiting approval)" : ""}`}
                          className={`block h-5 rounded-sm ${TYPE_COLORS[r.typeCode] ?? "bg-stone-400"} ${r.workflow.status === "pending" ? "opacity-40" : ""}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!people.length && <Empty>Nobody you can see has leave in {monthName}.</Empty>}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-600">
        {Object.entries(TYPE_COLORS).map(([code, cls]) => (
          <span key={code} className="flex items-center gap-1.5"><span className={`size-3 rounded-sm ${cls}`} />{code.charAt(0) + code.slice(1).toLowerCase()}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-stone-100" />Weekend / public holiday</span>
      </div>
    </>
  );
}
