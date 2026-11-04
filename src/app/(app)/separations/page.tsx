import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Hourglass, Plus } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { KIND_LABELS, listSeparations, upcomingRetirements } from "@/server/services/separations";
import { Badge, Empty, PageHeader, fmtDate } from "@/components/ui";
import { WorkflowBadge } from "@/components/workflow";

export const metadata: Metadata = { title: "Exits" };

export default async function SeparationsPage() {
  const ctx = await requireCtx();
  const [{ items, clearanceTasks }, retirements] = await Promise.all([listSeparations(ctx), upcomingRetirements(ctx)]);
  const canStart = has(ctx, "separation:initiate");

  return (
    <>
      <PageHeader
        title="Exits"
        actions={canStart && <Link href="/separations/new" className="btn-primary"><Plus className="size-4" /> Start an exit</Link>}
      />

      {clearanceTasks.length > 0 && (
        <section className="card mb-6 border-amber-300 overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 font-semibold"><ClipboardCheck className="size-4 text-amber-600" /> Waiting for your department</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {clearanceTasks.map((t, i) => (
              <li key={i}>
                <Link href={`/separations/${t.separationId}`} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 hover:bg-stone-50">
                  <span><b>{t.employeeName}</b> · {t.item}</span>
                  <span className="text-stone-500">last day {fmtDate(t.lastDay)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {retirements && retirements.length > 0 && (
        <section className="card mb-6 overflow-hidden">
          <h2 className="flex items-center gap-2 border-b border-stone-200 px-4 py-3 font-semibold"><Hourglass className="size-4 text-stone-500" /> Retiring in the next year</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {retirements.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span><Link href={`/people/${r.id}`} className="font-medium hover:underline">{r.name}</Link> · {r.jobTitle}</span>
                <span className="flex items-center gap-3">
                  <span className="text-stone-500">{fmtDate(r.retirementDate)}</span>
                  {r.separationId ? (
                    <Link href={`/separations/${r.separationId}`} className="text-brand-700 hover:underline">In progress →</Link>
                  ) : (
                    canStart && <Link href={`/separations/new?employee=${r.id}&kind=retirement`} className="btn-secondary py-1">Start retirement</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-hidden">
        <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">All exits</h2>
        <ul className="divide-y divide-stone-100">
          {items.map((s) => (
            <li key={String(s._id)}>
              <Link href={`/separations/${s._id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                <span>
                  <span className="block font-medium">{s.employeeName}: {KIND_LABELS[s.kind as keyof typeof KIND_LABELS].toLowerCase()}</span>
                  <span className="block text-xs text-stone-500">{s.number} · last day {fmtDate(s.lastDay)}</span>
                </span>
                {s.completedAt ? (
                  <Badge>Left</Badge>
                ) : s.workflow.status === "approved" ? (
                  <Badge tone="blue">Clearance: {s.clearance.filter((c) => c.signedAt).length}/{s.clearance.length}</Badge>
                ) : (
                  <WorkflowBadge wf={s.workflow} />
                )}
              </Link>
            </li>
          ))}
        </ul>
        {!items.length && <Empty>No exits in progress.</Empty>}
      </section>
    </>
  );
}
