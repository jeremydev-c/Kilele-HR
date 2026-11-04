"use client";

/** A filter dropdown that applies as soon as you pick something, no "Filter" button needed. */
export function AutoSelect({ name, defaultValue, children, label }: { name: string; defaultValue?: string; children: React.ReactNode; label: string }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="input w-auto pr-8"
    >
      {children}
    </select>
  );
}
