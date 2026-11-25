"use client";

import { useState } from "react";
import { isDisposable, suggestEmail } from "@/lib/emailCheck";

/**
 * An email box that spots slips as you leave it: "Did you mean jane@gmail.com?"
 * with Use it / Keep mine. "Keep mine" posts `<name>Confirmed`, so the server
 * accepts that exact spelling too. Throwaway inboxes get a warning here and are
 * refused on save.
 */
export function EmailInput({
  name,
  id = name,
  defaultValue = "",
  value: controlled,
  onValueChange,
  required,
  placeholder,
  autoComplete,
  autoFocus,
}: {
  name: string;
  id?: string;
  defaultValue?: string;
  /** Controlled use: the parent owns the value. */
  value?: string;
  onValueChange?: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const setValue = (v: string) => (onValueChange ? onValueChange(v) : setOwn(v));
  const [checked, setChecked] = useState(false); // only nag once they've left the box
  const [confirmed, setConfirmed] = useState("");

  const trimmed = value.trim();
  const suggestion = checked && trimmed && confirmed !== trimmed.toLowerCase() ? suggestEmail(trimmed) : null;
  const throwaway = checked && trimmed && !suggestion && isDisposable(trimmed);

  return (
    <>
      <input
        id={id}
        name={name}
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setChecked(true)}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        spellCheck={false}
        className="input"
        aria-describedby={suggestion || throwaway ? `${id}-hint` : undefined}
      />
      <input type="hidden" name={`${name}Confirmed`} value={confirmed} />
      {suggestion && (
        <p id={`${id}-hint`} role="status" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-800">
          <span>
            Did you mean <strong className="font-semibold">{suggestion}</strong>?
          </span>
          <button type="button" className="font-medium text-brand-700 underline-offset-2 hover:underline" onClick={() => setValue(suggestion)}>
            Use it
          </button>
          <button type="button" className="text-stone-500 underline-offset-2 hover:underline" onClick={() => setConfirmed(trimmed.toLowerCase())}>
            Keep mine
          </button>
        </p>
      )}
      {throwaway && (
        <p id={`${id}-hint`} role="status" className="mt-1.5 text-sm text-amber-800">
          That looks like a temporary inbox. Use an address that will still work in a few months.
        </p>
      )}
    </>
  );
}
