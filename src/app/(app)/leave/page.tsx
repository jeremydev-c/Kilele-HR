import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { myLeave } from "@/server/services/leave";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { WorkflowBadge } from "@/components/workflow";
import { ApplyForm } from "./ApplyForm";

export const metadata: Metadata = { title: "My leave" };

export default async function MyLeavePage() {
  const ctx = await requireCtx();
  if (!ctx.employee) {
    return <PageHeader title="My leave" subtitle="Leave is only available to employees." />;
  }
  const data = await load(myLeave(ctx));
  const upcomingHolidays = data.holidays.filter((h) => h.date >= data.today).slice(0, 4);

  return (
    <>
      <PageHeader title="My leave" subtitle={String(data.year)} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.balances.map((b) => (
          <div key={b.code} className="card p-4">
            <p className="text-sm text-stone-500">{b.name}</p>
            <p className="mt-1 text-3xl font-semibold">
              {b.available}
              <span className="text-sm font-normal text-stone-500"> / {b.entitlement + b.carriedOver + b.adjustments} days</span>
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {[
                b.taken && `${b.taken} taken`,
                b.pending && `${b.pending} awaiting approval`,
                b.carriedOver && `${b.carriedOver} carried over`,
                b.adjustments && `${b.adjustments > 0 ? "+" : ""}${b.adjustments} adjusted by HR`,
              ].filter(Boolean).join(" · ") || (b.dayCount === "calendar" ? "Counted in calendar days" : "Counted in working days")}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <section className="card self-start p-5">
          <h2 className="mb-4 font-semibold">Apply for leave</h2>
          <ApplyForm types={data.types} balances={data.balances} nextYear={data.nextYear} holidays={data.holidays} today={data.today} />
          {upcomingHolidays.length > 0 && (
            <div className="mt-5 border-t border-stone-100 pt-4 text-xs text-stone-500">
              <p className="font-medium text-stone-600">Coming public holidays</p>
              <ul className="mt-1 space-y-0.5">
                {upcomingHolidays.map((h) => <li key={h.date}>{fmtDate(h.date)}: {h.name}</li>)}
              </ul>
            </div>
          )}
        </section>

        <section className="card self-start overflow-hidden">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">My requests</h2>
          <ul className="divide-y divide-stone-100">
            {data.requests.map((r) => (
              <li key={String(r._id)}>
                <Link href={`/leave/${r._id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                  <span>
                    <span className="block text-sm font-medium">{r.typeName} · {r.days} day{r.days === 1 ? "" : "s"}</span>
                    <span className="block text-xs text-stone-500">{fmtDate(r.start)} – {fmtDate(r.end)} · {r.number}</span>
                  </span>
                  <WorkflowBadge wf={r.workflow} />
                </Link>
              </li>
            ))}
          </ul>
          {!data.requests.length && <Empty>No leave requests yet.</Empty>}
        </section>
      </div>
    </>
  );
}
