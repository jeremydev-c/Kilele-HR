"use client";

import { useState } from "react";
import { groupedPermissions, SCOPES, SCOPE_LABELS } from "@/lib/permissions";

/**
 * The role editor: one row per permission. Scoped permissions have a
 * checkbox per scope (own / team / department / all); unscoped ones have one.
 * Boxes for grants you don't hold yourself are disabled: the server
 * refuses them anyway (no privilege escalation).
 */
export function PermissionMatrix({
  initial,
  grantable,
  readOnly = false,
}: {
  initial: string[];
  grantable: string[];
  readOnly?: boolean;
}) {
  const [checked, setChecked] = useState(() => new Set(initial));
  const canGrant = new Set(grantable);

  const toggle = (g: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const box = (g: string, label: string) => {
    const disabled = readOnly || !canGrant.has(g);
    return (
      <label className={`inline-flex items-center justify-center p-1 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`} title={label}>
        <input
          type="checkbox"
          name="grants"
          value={g}
          checked={checked.has(g)}
          onChange={() => toggle(g)}
          disabled={disabled}
          aria-label={label}
          className="size-4 accent-brand-600 disabled:opacity-40"
        />
        {/* Disabled inputs aren't submitted: keep grants you can't change exactly as they are. */}
        {disabled && checked.has(g) && <input type="hidden" name="grants" value={g} />}
      </label>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Permission</th>
            {SCOPES.map((s) => (
              <th key={s} className="w-24 text-center" title={SCOPE_LABELS[s]}>{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupedPermissions().flatMap(({ group, perms }) => [
            <tr key={group}>
              <td colSpan={5} className="bg-stone-50/60 !py-1.5 text-xs font-semibold text-stone-500">{group}</td>
            </tr>,
            ...perms.map((p) => (
              <tr key={p.key} className="hover:bg-stone-50/60">
                <td>
                  <p>{p.label}</p>
                  <p className="font-mono text-xs text-stone-400">{p.key}</p>
                </td>
                {p.scoped ? (
                  SCOPES.map((s) => (
                    <td key={s} className="text-center">{box(`${p.key}@${s}`, `${p.label}: ${SCOPE_LABELS[s]}`)}</td>
                  ))
                ) : (
                  <td colSpan={4} className="text-center">{box(p.key, p.label)}</td>
                )}
              </tr>
            )),
          ])}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-stone-500">
        <b>own</b>: their own record · <b>team</b>: everyone who reports to them, directly or indirectly ·{" "}
        <b>department</b>: their department · <b>all</b>: everyone.
      </p>
    </div>
  );
}
