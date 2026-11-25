"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, FieldError } from "@/components/ActionForm";
import type { ActionResult } from "@/server/errors";

type Goal = { title: string; measure: string; weight: string };

const START: Goal[] = [
  { title: "", measure: "", weight: "40" },
  { title: "", measure: "", weight: "30" },
  { title: "", measure: "", weight: "30" },
];

/** The manager writes 2–8 goals; the weights must add up to 100 before it can be sent. */
export function GoalsEditor({ action, employeeFirstName }: { action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>; employeeFirstName: string }) {
  const [goals, setGoals] = useState<Goal[]>(START);
  const total = goals.reduce((s, g) => s + (Number(g.weight) || 0), 0);
  const set = (i: number, patch: Partial<Goal>) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const payload = JSON.stringify(goals.map((g) => ({ title: g.title, measure: g.measure, weight: Number(g.weight) || 0 })));

  return (
    <ActionForm action={action} className="space-y-4" confirm={`Send these goals to ${employeeFirstName}? They can't be changed after.`}>
      <input type="hidden" name="goals" value={payload} />
      <ol className="space-y-3">
        {goals.map((g, i) => (
          <li key={i} className="rounded-xl border border-stone-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">Goal {i + 1}</span>
              {goals.length > 2 && (
                <button type="button" className="btn-plain h-8 text-stone-500" onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))} aria-label={`Remove goal ${i + 1}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
              <div>
                <label className="label" htmlFor={`goal-title-${i}`}>What should they achieve?</label>
                <input id={`goal-title-${i}`} className="input" value={g.title} onChange={(e) => set(i, { title: e.target.value })} placeholder="e.g. Launch the new customer dashboard" maxLength={140} required />
              </div>
              <div>
                <label className="label" htmlFor={`goal-weight-${i}`}>Weight %</label>
                <input id={`goal-weight-${i}`} className="input tabular-nums" type="number" min={5} max={100} step={5} inputMode="numeric" value={g.weight} onChange={(e) => set(i, { weight: e.target.value })} required />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`goal-measure-${i}`}>How you&apos;ll judge it (optional)</label>
                <input id={`goal-measure-${i}`} className="input" value={g.measure} onChange={(e) => set(i, { measure: e.target.value })} placeholder="e.g. Live by June, used weekly by 80% of clients" maxLength={240} />
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {goals.length < 8 ? (
          <button type="button" className="btn-secondary" onClick={() => setGoals((gs) => [...gs, { title: "", measure: "", weight: "10" }])}>
            <Plus className="size-4" /> Add a goal
          </button>
        ) : <span className="text-sm text-stone-500">8 goals is the most.</span>}
        <span className={`text-sm font-medium tabular-nums ${total === 100 ? "text-emerald-700" : "text-amber-700"}`} aria-live="polite">
          Weights total {total}%{total !== 100 && ` (needs 100%)`}
        </span>
      </div>
      <FieldError name="goals" />
      <button className="btn-primary" disabled={total !== 100}>Set goals and send to {employeeFirstName}</button>
    </ActionForm>
  );
}
