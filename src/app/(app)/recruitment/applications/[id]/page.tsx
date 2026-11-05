import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Check, EyeOff, FileText, Mail, MapPin, Phone } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getApplication, panelOptions } from "@/server/services/recruitment";
import { GRADES } from "@/lib/grades";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { Badge, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { kes } from "@/components/people";
import { Input, PiiFields, Select } from "../../../people/fields";
import { hireAction, moveStageAction, offerAction, scheduleInterviewAction, scorecardAction } from "../../actions";

export const metadata: Metadata = { title: "Candidate" };

const STAGE_TONE: Record<string, "gray" | "blue" | "amber" | "green" | "red" | "violet"> = {
  new: "gray", shortlisted: "blue", interview: "violet", offer: "amber", accepted: "green", hired: "green", rejected: "red", withdrawn: "gray", declined: "gray",
};
const REC = { strong_yes: "Strong yes", yes: "Yes", no: "No", strong_no: "Strong no" } as Record<string, string>;
const MODE = { in_person: "In person", video: "Video", phone: "Phone" } as Record<string, string>;

/** Interview start times: 07:00 to 19:00, every 15 minutes. */
const TIME_SLOTS = Array.from({ length: 49 }, (_, i) => {
  const t = `${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
  return { value: t, label: t };
});

/** The earliest date the picker offers: today in Nairobi (the server may run on UTC). */
function todayInNairobi() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { app, vacancy: v, full, interviews, questions, canReview, canOffer, canHire, moves } = await load(getApplication(ctx, id));
  const panel = canReview && ["shortlisted", "interview"].includes(app.stage) ? await panelOptions() : [];
  const grade = GRADES.find((g) => g.code === v.grade)!;
  const nameParts = app.candidate.name.split(/\s+/);
  const answer = (key: string) => app.answers.find((a) => a.key === key)?.value ?? "";

  return (
    <>
      <PageHeader
        title={app.candidate.name}
        subtitle={<>{app.number} · applied for <Link href={`/recruitment/vacancies/${v._id}`} className="text-brand-700 hover:underline">{v.title}</Link> on {fmtDate(app.history[0]?.at ?? app.createdAt)}</>}
        back={{ href: full ? `/recruitment/vacancies/${v._id}` : "/recruitment", label: full ? v.title : "Hiring" }}
        actions={
          <>
            <Badge tone={STAGE_TONE[app.stage]}>{app.stage}</Badge>
            {full && <Badge tone="blue">Screening score {app.score}</Badge>}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        {/* ---------------- Left: who they are ---------------- */}
        <div className="space-y-6">
          <Card title="Candidate">
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2"><Mail className="size-4 text-stone-400" />{app.candidate.email}</li>
              <li className="flex items-center gap-2"><Phone className="size-4 text-stone-400" />{app.candidate.phone}</li>
              {app.candidate.location && <li className="flex items-center gap-2"><MapPin className="size-4 text-stone-400" />{app.candidate.location}</li>}
            </ul>
            {app.cvFileId && (
              <a href={`/api/cv/${id}`} target="_blank" className="btn-secondary mt-4"><FileText className="size-4" /> Open CV (PDF)</a>
            )}
            
          </Card>

          {full && questions.length > 0 && (
            <Card title="Screening answers">
              <ul className="space-y-2 text-sm">
                {questions.map((q) => {
                  const ko = app.knockouts.includes(q.text);
                  return (
                    <li key={q.key} className="flex items-start justify-between gap-3">
                      <span className="text-stone-600">{q.text}</span>
                      <span className={`flex shrink-0 items-center gap-1 font-medium ${ko ? "text-amber-700" : ""}`}>
                        {ko && <AlertTriangle className="size-3.5" />}{answer(q.key) === "yes" ? "Yes" : answer(q.key) === "no" ? "No" : answer(q.key)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {app.knockouts.length > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Misses {app.knockouts.length} must-have{app.knockouts.length === 1 ? "" : "s"}. </p>
              )}
            </Card>
          )}

          {app.coverLetter && (
            <Card title="Cover note"><p className="text-sm whitespace-pre-line text-stone-700">{app.coverLetter}</p></Card>
          )}

          {full && (
            <Card title="History">
              <ol className="space-y-2 text-sm">
                {app.history.map((h, i) => (
                  <li key={i}>
                    <span className="font-medium capitalize">{h.stage}</span> · {fmtDateTime(h.at)} · {h.byName}
                    {h.note && <span className="block text-xs text-stone-500">{h.note}</span>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {/* ---------------- Right: what happens next ---------------- */}
        <div className="space-y-6">
          {moves.length > 0 && (
            <Card title="Decide">
              <ActionForm action={moveStageAction.bind(null, id)} className="space-y-3">
                <div>
                  <label className="label" htmlFor="note">Note (needed to reject)</label>
                  <input id="note" name="note" className="input" placeholder="e.g. Stronger candidates shortlisted" />
                  <FieldError name="note" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {moves.includes("shortlisted") && <button name="to" value="shortlisted" className="btn-primary">Shortlist</button>}
                  {moves.includes("new") && <button name="to" value="new" className="btn-secondary">Back to new</button>}
                  {moves.includes("rejected") && <button name="to" value="rejected" className="btn-danger">Reject</button>}
                </div>
              </ActionForm>
            </Card>
          )}

          {interviews.map((iv, n) => {
            const avg = (criterion: string) => {
              const xs = iv.scorecards.flatMap((s) => s.scores.filter((x) => x.criterion === criterion).map((x) => x.score ?? 0));
              return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–";
            };
            return (
              <Card key={iv.id} title={`Interview ${n + 1}: ${fmtDateTime(iv.at)}`}>
                <p className="text-sm text-stone-600">{MODE[iv.mode]} · {iv.where} · {iv.durationMins} min · set up by {iv.scheduledByName}</p>
                <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {iv.panel.map((p) => (
                    <Badge key={p.id} tone={p.submitted ? "green" : "gray"}>{p.submitted && <Check className="mr-1 size-3" />}{p.name}</Badge>
                  ))}
                </p>

                {iv.scorecards.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="data-table">
                      <thead><tr><th>Criterion</th>{iv.scorecards.map((s) => <th key={s.name}>{s.name.split(" ")[0]}</th>)}<th>Avg</th></tr></thead>
                      <tbody>
                        {v.criteria.map((c) => (
                          <tr key={c}>
                            <td>{c}</td>
                            {iv.scorecards.map((s) => <td key={s.name}>{s.scores.find((x) => x.criterion === c)?.score}</td>)}
                            <td className="font-semibold">{avg(c)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td>Recommendation</td>
                          {iv.scorecards.map((s) => <td key={s.name}><Badge tone={s.recommendation.includes("yes") ? "green" : "red"}>{REC[s.recommendation]}</Badge></td>)}
                          <td />
                        </tr>
                      </tbody>
                    </table>
                    {iv.scorecards.map((s) => s.notes && <p key={s.name} className="mt-2 text-xs text-stone-600"><b>{s.name}:</b> “{s.notes}”</p>)}
                  </div>
                )}
                {iv.hiddenCount > 0 && (
                  <p className="mt-3 flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
                    <EyeOff className="size-4" /> {iv.hiddenCount} other scorecard(s) hidden until you submit yours.
                  </p>
                )}

                {iv.canScore && (
                  <ActionForm action={scorecardAction.bind(null, id)} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
                    <input type="hidden" name="interviewId" value={iv.id} />
                    <p className="text-sm font-medium">Your scorecard (1 = poor, 5 = excellent)</p>
                    {v.criteria.map((c, i) => (
                      <fieldset key={c} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <legend className="sr-only">{c}</legend>
                        <span>{c}</span>
                        <span className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <label key={s} className="cursor-pointer">
                              <input type="radio" name={`score_${i}`} value={s} required className="peer sr-only" />
                              <span className="flex size-8 items-center justify-center rounded-md border border-stone-300 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">{s}</span>
                            </label>
                          ))}
                        </span>
                      </fieldset>
                    ))}
                    <Select
                      name="recommendation"
                      label="Recommendation"
                      required
                      empty="Choose…"
                      options={Object.entries(REC).map(([value, label]) => ({ value, label }))}
                    />
                    <div>
                      <label className="label" htmlFor={`notes-${iv.id}`}>Why?</label>
                      <textarea id={`notes-${iv.id}`} name="notes" rows={3} required className="input" />
                      <FieldError name="notes" />
                    </div>
                    <button className="btn-primary">Submit scorecard</button>
                    <p className="text-xs text-stone-500">Scorecards can&apos;t be changed after you submit.</p>
                  </ActionForm>
                )}
              </Card>
            );
          })}

          {panel.length > 0 && (
            <Card title={interviews.length ? "Schedule another interview" : "Schedule an interview"}>
              <ActionForm action={scheduleInterviewAction.bind(null, id)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Separate date and time: Chrome's combined date-time box rejects a half-filled time with a confusing message. */}
                  <Input name="date" label="Date" type="date" required min={todayInNairobi()} />
                  <Select name="time" label="Time (Nairobi)" required defaultValue="10:00" options={TIME_SLOTS} />
                  <Input name="durationMins" label="Minutes" type="number" defaultValue={45} />
                  <Select name="mode" label="How" defaultValue="in_person" options={Object.entries(MODE).map(([value, label]) => ({ value, label }))} />
                  <Input name="where" label="Where" required placeholder="Boardroom, 4th floor / meet link" className="sm:col-span-2" />
                </div>
                <fieldset>
                  <legend className="label">Panel</legend>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {panel.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="panelIds" value={p.id} defaultChecked={p.id === String(v.hiringManagerId)} className="accent-brand-600" /> {p.name}
                      </label>
                    ))}
                  </div>
                  <FieldError name="panelIds" />
                </fieldset>
                <button className="btn-primary">Schedule</button>
              </ActionForm>
            </Card>
          )}

          {app.offer?.basicSalary && (
            <Card title="Offer">
              <p className="text-sm">{kes(app.offer.basicSalary)} / month, starting {fmtDate(app.offer.startDate)}. Made by {app.offer.madeByName} on {fmtDate(app.offer.madeAt)}; reply by {fmtDate(app.offer.expiresOn)}.</p>
              <p className="mt-1 text-sm font-medium">{app.stage === "offer" ? "Waiting for the candidate's answer." : app.stage === "declined" ? "Declined by the candidate." : "Accepted by the candidate."}</p>
            </Card>
          )}

          {canOffer && (
            <Card title="Make an offer">
              <ActionForm action={offerAction.bind(null, id)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input name="basicSalary" label="Basic salary (KES/month)" type="number" required hint={`${grade.code} band: ${grade.min.toLocaleString()}–${grade.max.toLocaleString()}`} />
                  <Input name="expiresOn" label="Reply by" type="date" required />
                  <Input name="startDate" label="Start date" type="date" required />
                </div>
                <button className="btn-primary">Send offer</button>
              </ActionForm>
            </Card>
          )}

          {canHire && (
            <Card title="Hire: create their employee record" className="border-brand-300">
              <p className="mb-4 text-sm text-stone-500">
                Job, grade, department, manager ({v.title}), start date and the offer&apos;s salary carry over automatically. Add what HR
                collects on the first day.
              </p>
              <ActionForm action={hireAction.bind(null, id)} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input name="firstName" label="First name" defaultValue={nameParts[0]} required />
                  <Input name="lastName" label="Last name" defaultValue={nameParts.at(-1)} required />
                  <Input name="otherNames" label="Other names" defaultValue={nameParts.slice(1, -1).join(" ")} />
                  <Select name="gender" label="Gender" required empty="Choose…" options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
                  <Input name="workEmail" label="Work email" type="email" required defaultValue={`${nameParts[0]}.${nameParts.at(-1)}@kilele.co.ke`.toLowerCase()} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2"><PiiFields /></div>
                <button className="btn-primary">Create employee record</button>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
