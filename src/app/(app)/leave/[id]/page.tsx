import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getLeave } from "@/server/services/leave";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { Badge, PageHeader, fmtDate } from "@/components/ui";
import { WorkflowBadge, WorkflowTimeline } from "@/components/workflow";
import { cancelLeaveAction } from "../actions";
import { decideAction } from "../../approvals/actions";

export const metadata: Metadata = { title: "Leave request" };

export default async function LeaveRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ applied?: string }>;
}) {
  const { id } = await params;
  const { applied } = await searchParams;
  const ctx = await requireCtx();
  const { doc, own, canDecide, whyNot, canCancel, balance, alsoAway } = await load(getLeave(ctx, id));
  const wf = doc.workflow;

  return (
    <>
      <PageHeader
        title={`${doc.typeName}: ${doc.employeeName}`}
        subtitle={`${doc.number} · ${doc.days} day${doc.days === 1 ? "" : "s"}, ${fmtDate(doc.start)} – ${fmtDate(doc.end)}`}
        back={own ? { href: "/leave", label: "My leave" } : { href: "/approvals", label: "Approvals" }}
        actions={<WorkflowBadge wf={wf} />}
      />

      {applied && (
        <p className="mb-6 flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <CheckCircle2 className="size-4" /> Sent. It&apos;s now with {wf.steps[wf.current]?.assigneeName ?? wf.steps[wf.current]?.label ?? "HR"}.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Request</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-stone-500">Employee</dt><dd><Link href={`/people/${doc.employeeId}`} className="text-brand-700 hover:underline">{doc.employeeName}</Link></dd></div>
              <div><dt className="text-stone-500">Type</dt><dd>{doc.typeName}</dd></div>
              <div><dt className="text-stone-500">Dates</dt><dd>{fmtDate(doc.start)} – {fmtDate(doc.end)}</dd></div>
              <div><dt className="text-stone-500">Days</dt><dd>{doc.days}</dd></div>
              <div><dt className="text-stone-500">Cover</dt><dd>{doc.handoverTo || <span className="text-stone-400">Not given</span>}</dd></div>
              <div><dt className="text-stone-500">Note</dt><dd>{doc.reason || <span className="text-stone-400">None</span>}</dd></div>
            </dl>
          </section>

          {(balance || alsoAway.length > 0) && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">{canDecide ? "Before you decide" : "Balance and cover"}</h2>
              {balance && (
                <p className="text-sm">
                  {doc.typeName} balance for {doc.year}: <b>{balance.available}</b> days left
                  {wf.status === "pending" ? ` (this request's ${doc.days} days already reserved)` : ""}, of {balance.entitlement + balance.carriedOver + balance.adjustments}.
                </p>
              )}
              <div className="mt-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {alsoAway.length ? <AlertTriangle className="size-4 text-amber-600" /> : <Users className="size-4 text-stone-400" />}
                  {alsoAway.length ? `${alsoAway.length} other${alsoAway.length === 1 ? "" : "s"} in the department away on some of these days` : "Nobody else in the department is away then."}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {alsoAway.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      {a.name} · {fmtDate(a.start)} – {fmtDate(a.end)}
                      {a.status === "pending" && <Badge tone="amber">not yet approved</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {canDecide && (
            <section className="card border-amber-300 p-5">
              <h2 className="font-semibold">Your decision: {wf.steps[wf.current].label}</h2>
              <ActionForm action={decideAction.bind(null, "leave", id)} className="mt-3 space-y-3">
                <div>
                  <label className="label" htmlFor="comment">Comment (needed if you reject)</label>
                  <textarea id="comment" name="comment" rows={2} className="input" />
                  <FieldError name="comment" />
                </div>
                <div className="flex gap-2">
                  <button name="decision" value="approve" className="btn-primary">Approve</button>
                  <button name="decision" value="reject" className="btn-danger">Reject</button>
                </div>
              </ActionForm>
            </section>
          )}
          {!canDecide && wf.status === "pending" && whyNot && !own && (
            <p className="rounded-lg bg-stone-100 px-4 py-3 text-sm text-stone-600">{whyNot}</p>
          )}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Approval trail</h2>
            <WorkflowTimeline wf={wf} />
          </section>
          {canCancel && (
            <ActionForm action={cancelLeaveAction.bind(null, id)} className="card space-y-3 p-5" confirm="Cancel this leave request?">
              <h2 className="font-semibold">Cancel this leave</h2>
              {!own && (
                <div>
                  <label className="label" htmlFor="reason">Reason</label>
                  <input id="reason" name="reason" className="input" required />
                </div>
              )}
              <button className="btn-danger">Cancel request</button>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
