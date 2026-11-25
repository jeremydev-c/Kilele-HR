import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Target } from "lucide-react";
import { requireCtx } from "@/server/context";
import { performanceHome } from "@/server/services/performance";
import { STAGE_LABELS, ratingLabel } from "@/lib/ratings";
import { Badge, Empty, PageHeader, fmtDate } from "@/components/ui";

export const metadata: Metadata = { title: "Performance" };

type Row = Awaited<ReturnType<typeof performanceHome>>["mine"][number];

function StageBadge({ r }: { r: Row }) {
  if (!r.open && r.stage !== "done") return <Badge>Cycle closed</Badge>;
  if (r.yourTurn) return <Badge tone="amber">Your turn</Badge>;
  return <Badge tone={r.stage === "done" ? "green" : "gray"}>{STAGE_LABELS[r.stage]}</Badge>;
}

function ReviewList({ rows, show }: { rows: Row[]; show: "cycle" | "person" }) {
  return (
    <ul className="divide-y divide-stone-100">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/performance/reviews/${r.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-stone-50">
            <span className="min-w-0">
              <span className="block font-medium">{show === "cycle" ? r.cycleName : r.employeeName}</span>
              <span className="block text-xs text-stone-500">
                {show === "cycle" ? `Reviewer: ${r.reviewerName}` : `${r.jobTitle} · ${r.cycleName}`} · due {fmtDate(r.dueOn)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {r.overall != null && <span className="text-sm text-stone-600 tabular-nums">{r.overall.toFixed(1)} · {ratingLabel(r.overall)}</span>}
              <StageBadge r={r} />
              <ChevronRight className="size-4 text-stone-400" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PerformancePage() {
  const ctx = await requireCtx();
  const { mine, writing, cycles, canStart } = await performanceHome(ctx);
  const turn = writing.filter((r) => r.yourTurn).length;

  return (
    <>
      <PageHeader
        title="Performance"
        subtitle="Goals, self-reviews and manager reviews, one cycle at a time."
        actions={canStart && <Link href="/performance/cycles/new" className="btn-primary"><Plus className="size-4" /> Start a review cycle</Link>}
      />

      {writing.length > 0 && (
        <section className="card mb-6 overflow-hidden">
          <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3 font-semibold">
            Reviews you write
            {turn > 0 && <Badge tone="amber">{turn} waiting for you</Badge>}
          </h2>
          <ReviewList rows={writing} show="person" />
        </section>
      )}

      <section className="card mb-6 overflow-hidden">
        <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">Your reviews</h2>
        {mine.length ? <ReviewList rows={mine} show="cycle" /> : <Empty icon={Target}>No reviews for you yet. HR starts them for everyone each cycle.</Empty>}
      </section>

      {cycles.length > 0 && (
        <section className="card overflow-hidden">
          <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">Review cycles</h2>
          <ul className="divide-y divide-stone-100">
            {cycles.map((c) => (
              <li key={c.id}>
                <Link href={`/performance/cycles/${c.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-stone-50">
                  <span>
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-xs text-stone-500">{fmtDate(c.periodStart)} to {fmtDate(c.periodEnd)} · due {fmtDate(c.dueOn)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-stone-600 tabular-nums">{c.done} of {c.total} complete</span>
                    <Badge tone={c.status === "open" ? "green" : "gray"}>{c.status === "open" ? "Open" : "Closed"}</Badge>
                    <ChevronRight className="size-4 text-stone-400" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
