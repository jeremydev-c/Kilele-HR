import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Lock, UserX } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { EXIT_REASONS, EXIT_TOPICS, KIND_LABELS, NOTICE_DAYS, getSeparation } from "@/server/services/separations";
import { ActionForm } from "@/components/ActionForm";
import { DecisionPanel, WaitingNote } from "@/components/DecisionPanel";
import { Badge, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { WorkflowBadge, WorkflowTimeline } from "@/components/workflow";
import { Select } from "../../people/fields";
import { decideAction } from "../../approvals/actions";
import { exitInterviewAction, signClearanceAction, withdrawSeparationAction } from "../actions";

export const metadata: Metadata = { title: "Exit" };

const STATUS = {
  pending: <Badge tone="amber">Waiting for approval</Badge>,
  clearing: <Badge tone="blue">Clearance in progress</Badge>,
  completing: <Badge tone="blue">Closes on the last day</Badge>,
  completed: <Badge>Left</Badge>,
} as Record<string, React.ReactNode>;

export default async function SeparationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { sep: s, own, hr, canDecide, whyNot, canWithdraw, signable, canExitInterview, shortNotice, leaveOwed, status } = await load(getSeparation(ctx, id));
  const signed = s.clearance.filter((c) => c.signedAt).length;
  const ei = s.exitInterview as null | { reason?: string; ratings?: { topic: string; score: number }[]; wouldRecommend?: boolean; comments?: string; submittedAt?: Date };

  return (
    <>
      <PageHeader
        title={`${KIND_LABELS[s.kind as keyof typeof KIND_LABELS]}: ${s.employeeName}`}
        subtitle={`${s.number} · last working day ${fmtDate(s.lastDay)} · started by ${s.workflow.requestedByName}`}
        back={{ href: "/separations", label: "Exits" }}
        actions={STATUS[status] ?? <WorkflowBadge wf={s.workflow} />}
      />

      {s.completedAt && (
        <p className="mb-6 flex items-center gap-2 rounded-lg bg-stone-100 px-4 py-3 text-sm">
          <UserX className="size-4" /> Completed {fmtDateTime(s.completedAt)}: employee record closed and login disabled.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          {canDecide && <DecisionPanel action={decideAction.bind(null, "separation", id)} step={s.workflow.steps[s.workflow.current].label} />}
          <section className="card p-5">
            <p className="text-sm text-stone-500">Reason</p>
            <p className="text-sm whitespace-pre-line">{s.reason}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {shortNotice != null && (
                <span className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                  <AlertTriangle className="size-4" /> {shortNotice} days&apos; notice, under the {NOTICE_DAYS} expected: pay in lieu may apply
                </span>
              )}
              {leaveOwed != null && leaveOwed > 0 && (
                <span className="rounded-md bg-sky-50 px-2 py-1 text-sky-800">{leaveOwed} annual leave days unused: to be taken or paid in the final dues</span>
              )}
            </div>
            <Link href={`/people/${s.employeeId}`} className="mt-4 inline-block text-sm text-brand-700 hover:underline">Open {s.employeeName}&apos;s profile →</Link>
          </section>

          {!canDecide && s.workflow.status === "pending" && whyNot && !own && (
            <WaitingNote>{whyNot}</WaitingNote>
          )}

          {s.clearance.length > 0 && (
            <section className="card overflow-hidden">
              <div className="border-b border-stone-200 px-4 py-3">
                <h2 className="font-semibold">Clearance ({signed}/{s.clearance.length})</h2>
                <p className="text-sm text-stone-500">Each department signs off its own items. Access ends automatically on the last day.</p>
              </div>
              <ul className="divide-y divide-stone-100">
                {s.clearance.map((c) => (
                  <li key={String(c._id)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="flex items-start gap-2">
                      {c.signedAt ? <CheckCircle2 className="mt-0.5 size-4 text-brand-600" /> : <Circle className="mt-0.5 size-4 text-stone-300" />}
                      <span>
                        <span className="block">{c.item}</span>
                        <span className="block text-xs text-stone-500">
                          {c.departmentName}{c.signedAt && ` · ${c.signedByName}, ${fmtDateTime(c.signedAt)}`}{c.note && ` · “${c.note}”`}
                        </span>
                      </span>
                    </span>
                    {signable.includes(String(c._id)) && (
                      <ActionForm action={signClearanceAction.bind(null, id, String(c._id))} className="flex gap-2">
                        <input name="note" placeholder="Note (optional)" className="input w-40 py-1" />
                        <button className="btn-secondary py-1">Sign off</button>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {canExitInterview && (
            <section className="card p-5">
              <h2 className="font-semibold">Your exit interview</h2>
              <p className="mb-4 text-sm text-stone-500">Only HR sees your answers, not your manager.</p>
              <ActionForm action={exitInterviewAction.bind(null, id)} className="space-y-4">
                <Select name="reason" label="Main reason for leaving" required empty="Choose…" options={EXIT_REASONS.map((r) => ({ value: r, label: r }))} />
                {EXIT_TOPICS.map((t, i) => (
                  <fieldset key={t} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <legend className="sr-only">{t}</legend>
                    <span>{t}</span>
                    <span className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n} className="cursor-pointer">
                          <input type="radio" name={`rating_${i}`} value={n} required className="peer sr-only" />
                          <span className="flex size-8 items-center justify-center rounded-md border border-stone-300 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">{n}</span>
                        </label>
                      ))}
                    </span>
                  </fieldset>
                ))}
                <Select name="wouldRecommend" label="Would you recommend Kilele as a place to work?" required empty="Choose…" options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
                <div>
                  <label className="label" htmlFor="comments">Anything else?</label>
                  <textarea id="comments" name="comments" rows={3} className="input" />
                </div>
                <button className="btn-primary">Submit</button>
              </ActionForm>
            </section>
          )}

          {ei?.submittedAt && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 font-semibold"><Lock className="size-4" /> Exit interview</h2>
              {hr || own ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="text-stone-500">Main reason:</span> {ei.reason}</p>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {ei.ratings?.map((r) => <li key={r.topic} className="flex justify-between gap-2 rounded bg-stone-50 px-2 py-1"><span>{r.topic}</span><b>{r.score}/5</b></li>)}
                  </ul>
                  <p><span className="text-stone-500">Would recommend us:</span> {ei.wouldRecommend ? "Yes" : "No"}</p>
                  {ei.comments && <p className="rounded bg-stone-50 px-3 py-2">“{ei.comments}”</p>}
                  <p className="text-xs text-stone-500">Submitted {fmtDateTime(ei.submittedAt)}. Visible to HR and {own ? "you" : "the leaver"} only.</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-500">Submitted {fmtDate(ei.submittedAt)}. The answers are for HR only.</p>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card self-start p-5">
            <h2 className="mb-4 font-semibold">Approval trail</h2>
            <WorkflowTimeline wf={s.workflow} />
          </section>
          {canWithdraw && (
            <ActionForm action={withdrawSeparationAction.bind(null, id)} confirm="Withdraw this exit?">
              <button className="btn-secondary w-full">Withdraw</button>
            </ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
