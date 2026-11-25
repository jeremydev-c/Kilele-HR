import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, MessageSquareWarning, UserX } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getCycle } from "@/server/services/performance";
import { STAGE_LABELS, ratingLabel } from "@/lib/ratings";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Empty, PageHeader, fmtDate } from "@/components/ui";
import { closeCycleAction } from "../../actions";

export const metadata: Metadata = { title: "Review cycle" };

const STAGES = ["goals", "self", "manager", "acknowledge", "done"] as const;
const BAR = { goals: "bg-stone-300", self: "bg-sky-300", manager: "bg-violet-400", acknowledge: "bg-amber-400", done: "bg-emerald-500" };

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { cycle, reviews, byStage, spread, average, canClose } = await load(getCycle(ctx, id));
  const total = reviews.length;
  const late = reviews.filter((r) => r.late).length;
  const disagreed = reviews.filter((r) => r.disagreed);
  const maxBand = Math.max(1, ...spread.map((s) => s.count));

  return (
    <>
      <PageHeader
        title={cycle.name}
        subtitle={`${fmtDate(cycle.periodStart)} to ${fmtDate(cycle.periodEnd)} · due ${fmtDate(cycle.dueOn)} · started by ${cycle.startedByName}`}
        back={{ href: "/performance", label: "Performance" }}
        actions={
          <>
            <Badge tone={cycle.status === "open" ? "green" : "gray"}>{cycle.status === "open" ? "Open" : `Closed ${fmtDate(cycle.closedAt)}`}</Badge>
            {canClose && (
              <ActionForm action={closeCycleAction.bind(null, id)} confirm="Close the cycle? Unfinished reviews are frozen where they got to, and nobody can change them after.">
                <button className="btn-secondary">Close the cycle</button>
              </ActionForm>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Progress</h2>
            <span className="text-sm text-stone-600 tabular-nums">{byStage.done} of {total} complete{late > 0 && <span className="text-red-700"> · {late} late</span>}</span>
          </div>
          {total > 0 && (
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={STAGES.map((s) => `${STAGE_LABELS[s]}: ${byStage[s]}`).join(", ")}>
              {STAGES.map((s) => byStage[s] > 0 && <div key={s} className={BAR[s]} style={{ width: `${(byStage[s] / total) * 100}%` }} />)}
            </div>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {STAGES.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-full ${BAR[s]}`} />
                <dt className="text-stone-600">{STAGE_LABELS[s]}</dt>
                <dd className="ml-auto font-medium tabular-nums">{byStage[s]}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Ratings so far</h2>
            {average != null && <span className="text-sm text-stone-600 tabular-nums">Average {average.toFixed(1)}</span>}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {[...spread].reverse().map((s) => (
              <li key={s.band} className="grid grid-cols-[1rem_minmax(0,10rem)_minmax(0,1fr)_1.5rem] items-center gap-2">
                <span className="font-medium tabular-nums text-stone-500">{s.band}</span>
                <span className="truncate text-xs text-stone-600" title={s.label}>{s.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                  <span className="block h-full rounded-full bg-stone-800" style={{ width: `${(s.count / maxBand) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{s.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">Counted once the manager has submitted. Overall scores are rounded to the nearest band.</p>
        </section>
      </div>

      {disagreed.length > 0 && (
        <section className="card mb-6 overflow-hidden border-amber-300">
          <h2 className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 font-semibold"><MessageSquareWarning className="size-4 text-amber-600" /> Disagreed with their review</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {disagreed.map((r) => (
              <li key={r.id}><Link href={`/performance/reviews/${r.id}`} className="flex justify-between gap-2 px-4 py-2.5 hover:bg-stone-50"><span><b>{r.employeeName}</b> · reviewed by {r.reviewerName}</span><span className="text-brand-700">Read →</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {cycle.skipped.length > 0 && (
        <section className="card mb-6 overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 font-semibold"><UserX className="size-4 text-stone-500" /> Not in this cycle</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {cycle.skipped.map((s) => (
              <li key={String(s.employeeId)} className="flex justify-between gap-2 px-4 py-2.5"><Link href={`/people/${s.employeeId}`} className="font-medium hover:underline">{s.name}</Link><span className="text-stone-500">{s.reason}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden">
        <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">Reviews</h2>
        {total ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Employee</th><th>Reviewer</th><th>Stage</th><th className="text-right">Overall</th></tr></thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/performance/reviews/${r.id}`} className="font-medium hover:underline">{r.employeeName}</Link><span className="block text-xs text-stone-500">{r.jobTitle}</span></td>
                    <td className="text-stone-600">{r.reviewerName}</td>
                    <td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={r.stage === "done" ? "green" : r.closedEarly ? "gray" : "blue"}>{r.closedEarly ? `Frozen at: ${STAGE_LABELS[r.stage].toLowerCase()}` : STAGE_LABELS[r.stage]}</Badge>
                        {r.late && <span className="flex items-center gap-1 text-xs text-red-700"><AlertTriangle className="size-3" />Late</span>}
                        {r.disagreed && <Badge tone="amber">Disagrees</Badge>}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{r.overall != null ? <span title={ratingLabel(r.overall)}>{r.overall.toFixed(1)}</span> : <span className="text-stone-400">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No reviews you can see in this cycle.</Empty>
        )}
      </section>
    </>
  );
}
