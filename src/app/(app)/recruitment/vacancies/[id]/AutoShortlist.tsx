"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ActionForm, FieldError } from "@/components/ActionForm";
import type { ActionResult } from "@/server/errors";

/** held: why the system leaves someone alone (missed a must-have, or a person moved them back to New). */
type Waiting = { score: number; held: "must-have" | "person" | null };

/**
 * HR sets a pass mark for an advert. Applicants who reach it, with every
 * must-have met, are shortlisted the moment they apply. The preview counts
 * who is waiting in New right now, so HR sees the effect before saving.
 */
export function AutoShortlist({
  action,
  current,
  waiting,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  current: number | null;
  waiting: Waiting[];
}) {
  const [mark, setMark] = useState(String(current ?? 70));
  const n = Number(mark);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100;
  const pass = valid ? waiting.filter((w) => !w.held && w.score >= n).length : 0;
  const missed = waiting.filter((w) => w.held === "must-have").length;
  const movedBack = waiting.filter((w) => w.held === "person").length;

  return (
    <section className="card mb-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-stone-500" /> Automatic shortlisting
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${current == null ? "bg-stone-100 text-stone-600" : "bg-green-50 text-green-800"}`}>
          {current == null ? "Off" : `On: ${current} and above`}
        </span>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        Applicants who score at least the pass mark on the screening questions, and meet every must-have, are shortlisted as soon as they apply and get the shortlist email.
        Nobody is ever rejected automatically: anyone below the mark waits in New for a person.
      </p>

      <ActionForm action={action} className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <label className="label" htmlFor="passMark">Pass mark (1–100)</label>
          <input
            id="passMark"
            name="passMark"
            type="number"
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            value={mark}
            onChange={(e) => setMark(e.target.value)}
            className="input w-28 tabular-nums"
          />
          <FieldError name="passMark" />
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="backlog" defaultChecked className="accent-brand-600" />
          Also shortlist people already waiting in New who meet it
        </label>
        <div className="flex gap-2">
          <button className="btn-primary" name="mode" value="on">{current == null ? "Turn on" : "Save pass mark"}</button>
          {current != null && <button className="btn-secondary" name="mode" value="off">Turn off</button>}
        </div>
        <p className="basis-full text-sm text-stone-600" aria-live="polite">
          {waiting.length === 0
            ? "Nobody is waiting in New right now."
            : valid
              ? `At ${n}: ${pass} of the ${waiting.length} waiting in New would be shortlisted now.`
              : "Enter a whole number from 1 to 100."}
          {missed > 0 && ` ${missed} missed a must-have and stay with a person to decide.`}
          {movedBack > 0 && ` ${movedBack} were moved back to New by a person and stay there.`}
        </p>
      </ActionForm>
    </section>
  );
}
