"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { createVacancyAction } from "../../actions";

type Q = { text: string; kind: "yesno" | "number"; weight: number; knockout: boolean; target: number | null; knockoutBelow: number | null };

const STARTERS: Q[] = [
  { text: "Are you legally allowed to work in Kenya?", kind: "yesno", weight: 1, knockout: true, target: null, knockoutBelow: null },
  { text: "Years of relevant work experience", kind: "number", weight: 2, knockout: false, target: 5, knockoutBelow: null },
];

/** The advert, plus screening questions that score each application automatically. */
export function VacancyForm({ requisitionId, closesDefault }: { requisitionId: string; closesDefault: string }) {
  const [questions, setQuestions] = useState<Q[]>(STARTERS);
  const update = (i: number, patch: Partial<Q>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <ActionForm action={createVacancyAction.bind(null, requisitionId)} className="space-y-6">
      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">The advert</h2>
        <div>
          <label className="label" htmlFor="summary">Summary</label>
          <textarea id="summary" name="summary" rows={3} required className="input" placeholder="What the role is and why it matters" />
          <FieldError name="summary" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="responsibilities">What you&apos;ll do <span className="font-normal text-stone-400">(one per line, start with -)</span></label>
            <textarea id="responsibilities" name="responsibilities" rows={5} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="requirements">What we&apos;re looking for</label>
            <textarea id="requirements" name="requirements" rows={5} className="input" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="location">Location</label>
            <input id="location" name="location" defaultValue="Nairobi (hybrid)" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="closesOn">Applications close</label>
            <input id="closesOn" name="closesOn" type="date" defaultValue={closesDefault} required className="input" />
            <FieldError name="closesOn" />
          </div>
          <div className="space-y-2 self-end text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="showSalary" defaultChecked className="accent-brand-600" /> Show the salary band</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="publish" defaultChecked className="accent-brand-600" /> Publish now</label>
          </div>
        </div>
      </section>

      <section className="card space-y-3 p-6">
        <div>
          <h2 className="font-semibold">Screening questions</h2>
          <p className="text-sm text-stone-500">
            Each application gets a 0–100 score from these. A <b>knock-out</b> flags anyone who misses a must-have, but doesn&apos;t
            hide them: a person still decides. Weight 0 = for information only.
          </p>
        </div>
        {questions.map((q, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-[1fr_8rem_5rem_auto] sm:items-end">
            <div>
              <label className="label text-xs">Question</label>
              <input value={q.text} onChange={(e) => update(i, { text: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label text-xs">Answer</label>
              <select value={q.kind} onChange={(e) => update(i, { kind: e.target.value as Q["kind"] })} className="input">
                <option value="yesno">Yes / No</option>
                <option value="number">Number</option>
              </select>
            </div>
            <div>
              <label className="label text-xs">Weight</label>
              <input type="number" min={0} max={5} value={q.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} className="input" />
            </div>
            <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} className="btn-secondary px-2" aria-label="Remove question">
              <Trash2 className="size-4" />
            </button>
            <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-4">
              {q.kind === "yesno" ? (
                <label className="flex items-center gap-2"><input type="checkbox" checked={q.knockout} onChange={(e) => update(i, { knockout: e.target.checked })} className="accent-brand-600" /> &quot;No&quot; is a knock-out</label>
              ) : (
                <>
                  <label className="flex items-center gap-2">Full marks at <input type="number" min={0} value={q.target ?? ""} onChange={(e) => update(i, { target: e.target.value ? Number(e.target.value) : null })} className="input w-20" /></label>
                  <label className="flex items-center gap-2">Knock-out below <input type="number" min={0} value={q.knockoutBelow ?? ""} onChange={(e) => update(i, { knockoutBelow: e.target.value ? Number(e.target.value) : null })} className="input w-20" /></label>
                </>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setQuestions((qs) => [...qs, { text: "", kind: "yesno", weight: 1, knockout: false, target: null, knockoutBelow: null }])}
          className="btn-secondary"
        >
          <Plus className="size-4" /> Add a question
        </button>
        <input type="hidden" name="questions" value={JSON.stringify(questions.filter((q) => q.text.trim()))} />
        <FieldError name="questions" />
      </section>

      <section className="card space-y-2 p-6">
        <label className="label" htmlFor="criteria">Interview scorecard criteria <span className="font-normal text-stone-400">(one per line; each scored 1–5)</span></label>
        <textarea id="criteria" name="criteria" rows={4} defaultValue={"Technical skills\nProblem solving\nCommunication\nTeam fit"} className="input" />
        <FieldError name="criteria" />
      </section>

      <div className="flex justify-end"><button className="btn-primary">Save advert</button></div>
    </ActionForm>
  );
}
