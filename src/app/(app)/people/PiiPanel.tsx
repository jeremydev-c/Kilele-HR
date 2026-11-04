"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { revealPiiAction } from "./actions";

const REVEAL_SECONDS = 60;

type Field = { key: string; label: string; masked: string };

/**
 * Personal and statutory details: masked by default. Revealing them asks
 * why (the reason goes into the audit trail with your name), and the values
 * hide themselves again after a minute.
 */
export function PiiPanel({ employeeId, fields, own }: { employeeId: string; fields: Field[]; own: boolean }) {
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);
  const [pending, start] = useTransition();
  const left = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  // While revealed: tick the countdown, and hide the values when time is up.
  useEffect(() => {
    if (!values) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const hide = setTimeout(() => setValues(null), expiresAt - Date.now());
    return () => {
      clearInterval(tick);
      clearTimeout(hide);
    };
  }, [values, expiresAt]);

  const reveal = () =>
    start(async () => {
      setError("");
      const r = await revealPiiAction(employeeId, reason);
      if (r.error) return setError(r.error);
      const t = Date.now();
      setNow(t);
      setExpiresAt(t + REVEAL_SECONDS * 1000);
      setValues(r.values ?? null);
      setAsking(false);
      setReason("");
    });

  return (
    <div>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key}>
            <dt className="text-stone-500">{f.label}</dt>
            <dd className={`font-mono ${values ? "text-stone-900" : "text-stone-600"}`}>
              {(values ? values[f.key] : f.masked) || <span className="font-sans text-stone-400">Not recorded</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-stone-100 pt-4">
        {values ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-amber-700">Visible for {left}s. This view is in the audit trail.</span>
            <button type="button" className="btn-secondary" onClick={() => setValues(null)}>
              <EyeOff className="size-4" /> Hide now
            </button>
          </div>
        ) : asking && !own ? (
          <div className="space-y-2">
            <label className="label" htmlFor="reveal-reason">Why do you need to see these details?</label>
            <div className="flex flex-wrap gap-2">
              <input
                id="reveal-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reveal()}
                placeholder="e.g. Preparing the November NSSF return"
                className="input max-w-md flex-1"
                autoFocus
              />
              <button type="button" className="btn-primary" disabled={pending} onClick={reveal}>
                <Eye className="size-4" /> Reveal
              </button>
              <button type="button" className="btn-secondary" onClick={() => setAsking(false)}>Cancel</button>
            </div>
            <p className="text-xs text-stone-500">Your name, this reason and the time are recorded in the audit trail.</p>
          </div>
        ) : (
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => (own ? reveal() : setAsking(true))}>
            <Lock className="size-4" /> {own ? "Show my details" : "Reveal full details"}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
