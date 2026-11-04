import type { Metadata } from "next";
import Link from "next/link";
import { Link2, Search, ShieldCheck } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { AUDIT_CATEGORIES, listAudit } from "@/server/services/auditTrail";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Empty, PageHeader, fmtDateTime } from "@/components/ui";
import { verifyChainAction } from "./actions";

export const metadata: Metadata = { title: "Audit trail" };

function tone(action: string) {
  if (/failed|locked|blocked|BROKEN/.test(action)) return "amber" as const;
  if (/disable|delete|reveal|reset|\.pii/.test(action)) return "red" as const;
  if (action.startsWith("auth.")) return "gray" as const;
  return "blue" as const;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "audit:read");
  const sp = await searchParams;
  const { entries, total, page, pages } = await load(
    listAudit(ctx, { q: sp.q, category: sp.category, page: Number(sp.page) || 1 }),
  );
  const pageHref = (p: number) => `?${new URLSearchParams({ ...(sp.q && { q: sp.q }), ...(sp.category && { category: sp.category }), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Who did what, and when."
      />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <form className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
            <input name="q" defaultValue={sp.q} placeholder="Search person or action" className="input w-64 pl-9" />
          </div>
          <select name="category" defaultValue={sp.category ?? ""} className="input w-44">
            <option value="">All activity</option>
            {Object.entries(AUDIT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
        <ActionForm action={verifyChainAction} className="max-w-md">
          <button className="btn-primary"><ShieldCheck className="size-4" /> Verify chain</button>
        </ActionForm>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-16">#</th>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th className="hidden xl:table-cell">Chain</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.seq}>
                <td className="font-mono text-xs text-stone-500">{e.seq}</td>
                <td className="whitespace-nowrap text-stone-600">{fmtDateTime(e.at)}</td>
                <td>
                  <p className="font-medium">{e.actorName}</p>
                  {e.ip && <p className="font-mono text-xs text-stone-400">{e.ip}</p>}
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone(e.action + e.summary)}>{e.action}</Badge>
                    <span>{e.summary}</span>
                  </div>
                  {e.reason && <p className="mt-1 text-xs text-stone-600">Reason: “{e.reason}”</p>}
                  {e.changes.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-stone-600">
                      {e.changes.map((c, i) => (
                        <li key={i}>
                          <span className="font-medium">{c.field}</span>
                          {c.from != null && <>: <span className="line-through decoration-stone-400">{c.from}</span></>}
                          {c.to != null && <> → {c.to}</>}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="hidden font-mono text-xs text-stone-400 xl:table-cell" title={`prev ${e.prevHash}\nhash ${e.hash}`}>
                  <Link2 className="mr-1 inline size-3" />
                  {e.hash.slice(0, 10)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <Empty>No audit entries match.</Empty>}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
        <span>{total} entries</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={pageHref(page - 1)} className="btn-secondary">Newer</Link>}
          <span className="px-2 py-2">Page {page} of {pages}</span>
          {page < pages && <Link href={pageHref(page + 1)} className="btn-secondary">Older</Link>}
        </div>
      </div>
    </>
  );
}
