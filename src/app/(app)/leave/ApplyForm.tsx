"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { countLeaveDays } from "@/lib/leaveDays";
import { applyLeaveAction } from "./actions";

type Type = { code: string; name: string; dayCount: "working" | "calendar"; backdateDays: number; description: string };
type Bal = { code: string; available: number };

/**
 * The apply form previews the day count and the balance left as you pick
 * dates, using the same countLeaveDays() the server uses to decide.
 */
export function ApplyForm({
  types, balances, nextYear, holidays, today,
}: {
  types: Type[]; balances: Bal[]; nextYear: Bal[]; holidays: { date: string; name: string }[]; today: string;
}) {
  const [code, setCode] = useState(types[0]?.code ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const type = types.find((t) => t.code === code);
  const year = start.slice(0, 4);
  const days = type && start && end ? countLeaveDays(start, end, type.dayCount, holidays.map((h) => h.date)) : 0;
  const pool = year && year !== today.slice(0, 4) ? nextYear : balances;
  const available = pool.find((b) => b.code === code)?.available ?? 0;
  const inRange = holidays.filter((h) => start && end && h.date >= start && h.date <= end);
  const min = type?.backdateDays
    ? new Date(new Date(`${today}T00:00:00Z`).getTime() - type.backdateDays * 86_400_000).toISOString().slice(0, 10)
    : today;

  return (
    <ActionForm action={applyLeaveAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="typeCode">Type of leave</label>
        <select id="typeCode" name="typeCode" value={code} onChange={(e) => setCode(e.target.value)} className="input">
          {types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
        {type?.description && <p className="mt-1 text-xs text-stone-500">{type.description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="start">First day off</label>
          <input id="start" name="start" type="date" min={min} value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} required className="input" />
          <FieldError name="start" />
        </div>
        <div>
          <label className="label" htmlFor="end">Last day off</label>
          <input id="end" name="end" type="date" min={start || min} value={end} onChange={(e) => setEnd(e.target.value)} required className="input" />
          <FieldError name="end" />
        </div>
      </div>

      {days > 0 && (
        <div className={`rounded-lg px-3 py-2 text-sm ${days > available ? "bg-red-50 text-red-800" : "bg-brand-50 text-brand-900"}`}>
          <p className="flex items-center gap-2 font-medium">
            <CalendarDays className="size-4" />
            {days} {type?.dayCount === "calendar" ? "calendar" : "working"} day{days === 1 ? "" : "s"} · {available - days >= 0 ? `${available - days} left after this` : `only ${available} available`}
          </p>
          {type?.dayCount === "working" && (
            <p className="mt-0.5 text-xs opacity-80">
              Weekends{inRange.length ? ` and ${inRange.map((h) => h.name).join(", ")}` : ""} not counted.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="label" htmlFor="handoverTo">Who covers your work?</label>
        <input id="handoverTo" name="handoverTo" placeholder="e.g. Naomi will handle QA sign-offs" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="reason">Note for your approvers (optional)</label>
        <textarea id="reason" name="reason" rows={2} className="input" />
      </div>
      <button className="btn-primary w-full sm:w-auto" disabled={!days || days > available}>Send for approval</button>
    </ActionForm>
  );
}
