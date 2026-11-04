import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getRequisition } from "@/server/services/recruitment";
import { gradeLabel } from "@/lib/grades";
import { ActionForm, FieldError } from "@/components/ActionForm";
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
        back={{ href: "/recruitment", label: "Recruitment" }}
        actions={<WorkflowBadge wf={req.workflow} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
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

          {canDecide && (
            <section className="card border-amber-300 p-5">
              <h2 className="font-semibold">Your decision</h2>
              <ActionForm action={decideAction.bind(null, "requisition", id)} className="mt-3 space-y-3">
                <div>
                  <label className="label" htmlFor="comment">Comment (needed if you reject)</label>
                  <textarea id="comment" name="comment" rows={2} className="input" />
                  <FieldError name="comment" />
                </div>
                <div className="flex gap-2">
                  <button name="decision" value="approve" className="btn-primary">Approve headcount</button>
                  <button name="decision" value="reject" className="btn-danger">Reject</button>
                </div>
              </ActionForm>
            </section>
          )}
          {!canDecide && req.workflow.status === "pending" && whyNot && (
            <p className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-600">{whyNot}</p>
          )}

          {canPublish && (
            <Link href={`/recruitment/vacancies/new?req=${id}`} className="card flex items-center gap-3 border-brand-300 p-5 hover:bg-brand-50">
              <Megaphone className="size-5 text-brand-700" />
              <span><span className="block font-semibold">Approved: write the job advert</span><span className="text-sm text-stone-500">Add the description and screening questions, then publish it to the careers site.</span></span>
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
