import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2 } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getMovement } from "@/server/services/movements";
import { gradeLabel } from "@/lib/grades";
import { DecisionPanel, WaitingNote } from "@/components/DecisionPanel";
import { PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { kes } from "@/components/people";
import { WorkflowBadge, WorkflowTimeline } from "@/components/workflow";
import { decideAction } from "../../approvals/actions";

export const metadata: Metadata = { title: "Promotion" };

function Job({ title, grade, salary }: { title?: string | null; grade?: string | null; salary?: number | null }) {
  return (
    <div className="flex-1 rounded-lg bg-stone-50 p-3 text-sm">
      <p className="font-medium">{title}</p>
      <p className="text-stone-500">{gradeLabel(grade ?? "")}</p>
      {salary != null && <p className="mt-1 font-semibold">{kes(salary)}</p>}
    </div>
  );
}

export default async function MovementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { move: m, canDecide, whyNot, scheduled } = await load(getMovement(ctx, id));

  return (
    <>
      <PageHeader
        title={`${m.kind === "promotion" ? "Promotion" : "Demotion"}: ${m.employeeName}`}
        subtitle={`${m.number} · effective ${fmtDate(m.effectiveDate)} · proposed by ${m.workflow.requestedByName}`}
        back={{ href: "/promotions", label: "Promotions" }}
        actions={<WorkflowBadge wf={m.workflow} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          {canDecide && <DecisionPanel action={decideAction.bind(null, "promotion", id)} step={m.workflow.steps[m.workflow.current].label} />}
          <section className="card p-5">
            <div className="flex items-center gap-3">
              <Job title={m.from.jobTitle} grade={m.from.grade} salary={m.from.basicSalary} />
              <ArrowRight className="size-5 shrink-0 text-stone-400" />
              <Job title={m.to.jobTitle} grade={m.to.grade} salary={m.to.basicSalary} />
            </div>
            {m.seesPay && !m.salaryChosen && <p className="mt-2 text-xs text-stone-500">Pay moved into the new grade&apos;s band automatically.</p>}
            <p className="mt-4 text-sm text-stone-500">Why</p>
            <p className="text-sm whitespace-pre-line">{m.justification}</p>
            <Link href={`/people/${m.employeeId}`} className="mt-4 inline-block text-sm text-brand-700 hover:underline">Open {m.employeeName}&apos;s profile →</Link>
          </section>

          {scheduled && (
            <p className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <CalendarClock className="size-4" /> Approved. Takes effect on {fmtDate(m.effectiveDate)}.
            </p>
          )}
          {m.appliedAt && (
            <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <CheckCircle2 className="size-4" /> In effect since {fmtDateTime(m.appliedAt)}.
            </p>
          )}

          {!canDecide && m.workflow.status === "pending" && whyNot && (
            <WaitingNote>{whyNot}</WaitingNote>
          )}
        </div>
        <section className="card self-start p-5">
          <h2 className="mb-4 font-semibold">Approval trail</h2>
          <WorkflowTimeline wf={m.workflow} />
        </section>
      </div>
    </>
  );
}
