import type { Metadata } from "next";
import { Check, Lock } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getReview } from "@/server/services/performance";
import { RATING_LABELS, STAGE_LABELS, ratingLabel } from "@/lib/ratings";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { Badge, Empty, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { acknowledgeAction, managerReviewAction, selfReviewAction, setGoalsAction } from "../../actions";
import { GoalsEditor } from "./GoalsEditor";

export const metadata: Metadata = { title: "Performance review" };

const STEPS = [
  { key: "goals", label: "Goals" },
  { key: "self", label: "Self-review" },
  { key: "manager", label: "Manager review" },
  { key: "acknowledge", label: "Sign-off" },
] as const;

function Stepper({ stage }: { stage: string }) {
  const at = stage === "done" ? STEPS.length : STEPS.findIndex((s) => s.key === stage);
  return (
    <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.key} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${i === at ? "border-stone-900 bg-white font-medium" : i < at ? "border-stone-200 bg-stone-50 text-stone-600" : "border-dashed border-stone-200 text-stone-400"}`}>
          <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] ${i < at ? "bg-emerald-600 text-white" : i === at ? "bg-stone-900 text-white" : "bg-stone-100"}`}>
            {i < at ? <Check className="size-3" strokeWidth={3} /> : i + 1}
          </span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** Five buttons, 1 to 5, each named by what it means. */
function RatingPicker({ name, label }: { name: string; label: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" title={RATING_LABELS[n]}>
            <input type="radio" name={name} value={n} required className="peer sr-only" />
            <span className="flex h-9 min-w-9 items-center justify-center rounded-[10px] px-3 text-sm font-medium ring-1 ring-stone-300 ring-inset transition peer-checked:bg-stone-900 peer-checked:text-white peer-checked:ring-stone-900 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 hover:bg-stone-50 peer-checked:hover:bg-stone-900">
              {n}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-stone-500">1 {RATING_LABELS[1].toLowerCase()} · 3 {RATING_LABELS[3].toLowerCase()} · 5 {RATING_LABELS[5].toLowerCase()}</p>
      <FieldError name={name} />
    </fieldset>
  );
}

function Rated({ who, rating, comment }: { who: string; rating?: number | null; comment: string }) {
  if (rating == null) return null;
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <p className="text-xs text-stone-500">{who}</p>
      <p className="text-sm font-medium"><span className="tabular-nums">{rating}</span> · {RATING_LABELS[rating]}</p>
      {comment && <p className="mt-1 text-sm whitespace-pre-line text-stone-700">{comment}</p>}
    </div>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { role, open, review: r, can } = await load(getReview(ctx, id));
  const firstName = r.employeeName.split(" ")[0];
  const rating = can.selfReview || can.managerReview;
  const ratingAction = can.selfReview ? selfReviewAction.bind(null, id) : managerReviewAction.bind(null, id);

  const goals = (
    <ol className="space-y-3">
      {r.goals.map((g, i) => (
        <li key={i} className="rounded-xl border border-stone-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{i + 1}. {g.title}</p>
              {g.measure && <p className="mt-0.5 text-sm text-stone-500">{g.measure}</p>}
            </div>
            <Badge>{g.weight}%</Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Rated who={role === "employee" ? "You" : `${firstName} (self)`} rating={g.selfRating} comment={g.selfComment} />
            <Rated who={`${r.reviewerName} (manager)`} rating={g.managerRating} comment={g.managerComment} />
          </div>
          {rating && (
            <div className="mt-3 grid gap-3 border-t border-stone-100 pt-3">
              <RatingPicker name={`rating_${i}`} label={can.selfReview ? "Your rating" : `Your rating for ${firstName}`} />
              <div>
                <label className="label" htmlFor={`comment_${i}`}>Comment (optional)</label>
                <textarea id={`comment_${i}`} name={`comment_${i}`} rows={2} maxLength={1000} className="input" placeholder={can.selfReview ? "What you did, and what got in the way" : "What you saw: examples help"} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <PageHeader
        title={role === "employee" ? "Your review" : r.employeeName}
        subtitle={`${r.cycleName} · ${r.jobTitle} · reviewer ${r.reviewerName} · due ${fmtDate(r.dueOn)}`}
        back={{ href: "/performance", label: "Performance" }}
        actions={!open && r.stage !== "done" ? <Badge><Lock className="mr-1 size-3" /> Cycle closed</Badge> : <Badge tone={r.stage === "done" ? "green" : "blue"}>{STAGE_LABELS[r.stage]}</Badge>}
      />
      <Stepper stage={r.stage} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Goals</h2>
            {can.setGoals ? (
              <>
                <p className="mb-4 text-sm text-stone-600">Set 2 to 8 goals for {firstName}, weighted by how much each matters. Once sent, {firstName} rates themselves on each one.</p>
                <GoalsEditor action={setGoalsAction.bind(null, id)} employeeFirstName={firstName} />
              </>
            ) : r.goals.length === 0 ? (
              <Empty>{role === "employee" ? `${r.reviewerName} is setting your goals. You'll get an email when it's your turn.` : `${r.reviewerName} hasn't set the goals yet.`}</Empty>
            ) : rating ? (
              <ActionForm action={ratingAction} className="space-y-5" confirm={can.selfReview ? "Submit your self-review? You can't change it after." : `Submit your review of ${firstName}? They'll be able to read it.`}>
                {goals}
                <div>
                  <label className="label" htmlFor="summary">{can.selfReview ? "Your year in a few lines" : `Summary for ${firstName}`}</label>
                  <textarea id="summary" name="summary" rows={5} maxLength={3000} required className="input" placeholder={can.selfReview ? "What went well, what you'd do differently, and what you need next year" : "Strengths, what to work on, and what support they'll get"} />
                  <FieldError name="summary" />
                </div>
                <button className="btn-primary">{can.selfReview ? "Submit self-review" : `Submit review of ${firstName}`}</button>
              </ActionForm>
            ) : (
              goals
            )}
          </section>

          {(r.selfSummary || r.managerSummary) && (
            <section className="card space-y-4 p-5">
              {r.selfSummary && (
                <div>
                  <h2 className="text-sm font-semibold text-stone-500">{role === "employee" ? "Your summary" : `${firstName}'s summary`}</h2>
                  <p className="mt-1 whitespace-pre-line">{r.selfSummary}</p>
                </div>
              )}
              {r.managerSummary && (
                <div>
                  <h2 className="text-sm font-semibold text-stone-500">{r.reviewerName}&apos;s summary</h2>
                  <p className="mt-1 whitespace-pre-line">{r.managerSummary}</p>
                </div>
              )}
            </section>
          )}

          {can.acknowledge && (
            <section className="card p-5">
              <h2 className="font-semibold">Sign off your review</h2>
              <p className="mt-1 text-sm text-stone-600">Signing off says you&apos;ve read it. If you see it differently, say so: HR reads every disagreement.</p>
              <ActionForm action={acknowledgeAction.bind(null, id)} className="mt-4 space-y-4">
                <fieldset className="space-y-2">
                  <legend className="sr-only">Do you agree?</legend>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="agree" value="yes" required className="accent-brand-600" /> I agree with this review</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="agree" value="no" className="accent-brand-600" /> I see some of it differently</label>
                  <FieldError name="agree" />
                </fieldset>
                <div>
                  <label className="label" htmlFor="comment">Your comment (needed if you disagree)</label>
                  <textarea id="comment" name="comment" rows={3} maxLength={2000} className="input" />
                  <FieldError name="comment" />
                </div>
                <button className="btn-primary">Sign off</button>
              </ActionForm>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-stone-500">Overall</h2>
            {r.overall != null ? (
              <>
                <p className="mt-1 text-4xl font-semibold tabular-nums">{r.overall.toFixed(1)}<span className="text-lg text-stone-400"> / 5</span></p>
                <p className="mt-1 font-medium">{ratingLabel(r.overall)}</p>
                <p className="mt-2 text-xs text-stone-500">The manager&apos;s ratings, weighted by each goal&apos;s weight.</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-stone-500">{role === "employee" ? "You'll see it once your manager has submitted their review." : "Not rated yet."}</p>
            )}
          </section>

          {r.acknowledgement && (
            <section className={`card p-5 ${r.acknowledgement.agreed ? "" : "border-amber-300"}`}>
              <h2 className="text-sm font-semibold text-stone-500">Sign-off</h2>
              <p className="mt-1 font-medium">{r.acknowledgement.agreed ? `${firstName} agrees` : `${firstName} disagrees`}</p>
              {r.acknowledgement.comment && <p className="mt-1 text-sm whitespace-pre-line text-stone-700">{r.acknowledgement.comment}</p>}
              <p className="mt-2 text-xs text-stone-500">{fmtDateTime(r.acknowledgement.at)}</p>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-2 text-sm font-semibold text-stone-500">History</h2>
            <ol className="space-y-2 text-sm">
              {r.history.map((h, i) => (
                <li key={i}>
                  <p>{h.note}</p>
                  <p className="text-xs text-stone-500">{h.byName} · {fmtDateTime(h.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
