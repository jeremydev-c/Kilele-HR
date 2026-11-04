import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getRequisition } from "@/server/services/recruitment";
import { gradeLabel } from "@/lib/grades";
import { DecisionPanel, WaitingNote } from "@/components/DecisionPanel";
import { PageHeader } from "@/components/ui";
import { WorkflowBadge, WorkflowTimeline } from "@/components/workflow";
import { decideAction } from "../../../approvals/actions";

export const metadata: Metadata = { title: "Hiring request" };

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { req, departmentName, canDecide, whyNot, canPublish } = await load(getRequisition(ctx, id));

  return (
    <>
      <PageHeader
        title={`${req.openings} × ${req.title}`}
        subtitle={`${req.number} · ${departmentName} · requested by ${req.hiringManagerName}`}
        back={{ href: "/recruitment", label: "Hiring" }}
        actions={<WorkflowBadge wf={req.workflow} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          {canDecide && <DecisionPanel action={decideAction.bind(null, "requisition", id)} step={"Talent & HR"} approveLabel="Approve hire" />}
          <section className="card p-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-stone-500">Grade</dt><dd>{gradeLabel(req.grade)}</dd></div>
              <div><dt className="text-stone-500">Type</dt><dd className="capitalize">{req.employmentType}</dd></div>
              <div><dt className="text-stone-500">Openings</dt><dd>{req.openings}</dd></div>
              <div><dt className="text-stone-500">Hiring manager</dt><dd>{req.hiringManagerName}</dd></div>
            </dl>
            <p className="mt-4 text-sm text-stone-500">Why it&apos;s needed</p>
            <p className="text-sm whitespace-pre-line">{req.justification}</p>
          </section>

          {!canDecide && req.workflow.status === "pending" && whyNot && (
            <WaitingNote>{whyNot}</WaitingNote>
          )}

          {canPublish && (
            <Link href={`/recruitment/vacancies/new?req=${id}`} className="card flex items-center gap-3 border-brand-300 p-5 hover:bg-brand-50">
              <Megaphone className="size-5 text-brand-700" />
              <span><span className="block font-semibold">Write the job advert</span><span className="text-sm text-stone-500">Add a description and screening questions, then publish.</span></span>
            </Link>
          )}
          {req.vacancyId && (
            <Link href={`/recruitment/vacancies/${req.vacancyId}`} className="btn-secondary">Open the job advert and applicants →</Link>
          )}
        </div>
        <section className="card self-start p-5">
          <h2 className="mb-4 font-semibold">Approval trail</h2>
          <WorkflowTimeline wf={req.workflow} />
        </section>
      </div>
    </>
  );
}
