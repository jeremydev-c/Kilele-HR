import { groupedPermissions, parseGrant, SCOPES, WILDCARD, type Scope } from "@/lib/permissions";
import { Badge } from "./ui";

type Source = { name: string; grants: string[] };

/**
 * "What can this person do, and why?": every permission they hold, at which
 * scopes, and which role gave it to them. Handy for answering "why can Mercy
 * see this?" without reading the code.
 */
export function AccessTable({ sources }: { sources: Source[] }) {
  // permission -> scope -> role names that grant it
  const held = new Map<string, Map<Scope, string[]>>();
  const add = (perm: string, scope: Scope, from: string) => {
    if (!held.has(perm)) held.set(perm, new Map());
    const byScope = held.get(perm)!;
    byScope.set(scope, [...(byScope.get(scope) ?? []), from]);
  };
  for (const s of sources) {
    for (const raw of s.grants) {
      if (raw === WILDCARD) {
        for (const { perms } of groupedPermissions()) for (const p of perms) add(p.key, "all", s.name);
        continue;
      }
      const g = parseGrant(raw);
      if (g) add(g.perm, g.scope, s.name);
    }
  }

  const groups = groupedPermissions()
    .map((g) => ({ ...g, perms: g.perms.filter((p) => held.has(p.key)) }))
    .filter((g) => g.perms.length);

  if (!groups.length) return <p className="px-4 py-6 text-sm text-stone-500">No permissions.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Permission</th>
            <th>Applies to</th>
            <th className="hidden md:table-cell">Granted by</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((g) => [
            <tr key={g.group}>
              <td colSpan={3} className="bg-stone-50/60 !py-1.5 text-xs font-semibold text-stone-500">{g.group}</td>
            </tr>,
            ...g.perms.map((p) => {
              const byScope = held.get(p.key)!;
              const scopes = SCOPES.filter((s) => byScope.has(s));
              const from = [...new Set(scopes.flatMap((s) => byScope.get(s)!))];
              return (
                <tr key={p.key}>
                  <td>
                    <p>{p.label}</p>
                    <p className="font-mono text-xs text-stone-400">{p.key}</p>
                  </td>
                  <td>
                    {p.scoped ? (
                      <div className="flex flex-wrap gap-1">
                        {scopes.map((s) => (
                          <Badge key={s} tone={s === "all" ? "violet" : s === "own" ? "gray" : "blue"}>{s}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="hidden text-stone-500 md:table-cell">{from.join(", ")}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </div>
  );
}
