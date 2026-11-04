import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { load } from "@/server/page";
import { listMovements } from "@/server/services/movements";
import { gradeLabel } from "@/lib/grades";
import { Badge, Empty, PageHeader, fmtDate } from "@/components/ui";
import { WorkflowBadge } from "@/components/workflow";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const ctx = await requireCtx();
  const moves = await load(listMovements(ctx));

  return (
    <>
      <PageHeader
        title="Promotions & demotions"
        subtitle="Proposed by a manager, approved by a senior manager and HR (two different people), applied on the effective date."
        actions={has(ctx, "promotion:initiate") && <Link href="/promotions/new" className="btn-primary"><Plus className="size-4" /> Propose</Link>}
      />
      <ul className="card divide-y divide-stone-100 overflow-hidden">
        {moves.map((m) => (
          <li key={String(m._id)}>
            <Link href={`/promotions/${m._id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
              <span className="flex items-start gap-3">
                {m.kind === "promotion" ? <TrendingUp className="mt-0.5 size-5 text-brand-600" /> : <TrendingDown className="mt-0.5 size-5 text-amber-600" />}
                <span>
                  <span className="block font-medium">{m.employeeName}: {m.to.jobTitle}</span>
                  <span className="block text-xs text-stone-500">{m.number} · {gradeLabel(m.from.grade ?? "")} → {gradeLabel(m.to.grade ?? "")} · effective {fmtDate(m.effectiveDate)}</span>
                </span>
              </span>
              <span className="flex gap-1.5">
                {m.workflow.status === "approved" && (m.appliedAt ? <Badge tone="green">Applied</Badge> : <Badge tone="blue">Scheduled</Badge>)}
                {m.workflow.status !== "approved" && <WorkflowBadge wf={m.workflow} />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!moves.length && <Empty>No promotions or demotions yet.</Empty>}
    </>
  );
}
