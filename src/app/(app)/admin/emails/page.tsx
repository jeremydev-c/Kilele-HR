import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Search, Send } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { resendUnsentAction } from "./actions";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { EMAIL_STATUSES, STATUS_TONE, countUnsent, listEmails } from "@/server/services/emails";
import { Badge, Empty, PageHeader, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Emails" };

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "email:read");
  const sp = await searchParams;
  const [{ emails, counts, sendingOn }, unsent] = await Promise.all([load(listEmails(ctx, sp)), load(countUnsent(ctx))]);

  return (
    <>
      <PageHeader
        title="Emails"
        subtitle="Every email Kilele HR wrote, and whether it went out."
        actions={
          sendingOn && unsent > 0 && (
            <ActionForm action={resendUnsentAction}>
              <button className="btn-primary"><Send className="size-4" /> Send all unsent ({unsent})</button>
            </ActionForm>
          )
        }
      />

      {!sendingOn && (
        <p className="mb-5 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Email sending isn&apos;t switched on yet, so emails are saved here instead. Add <code className="font-mono">RESEND_API_KEY</code> to start sending.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link href="?" className={`rounded-full px-3 py-1.5 ${!sp.status ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>All</Link>
          {Object.entries(EMAIL_STATUSES).map(([k, label]) => (
            <Link key={k} href={`?status=${k}`} className={`rounded-full px-3 py-1.5 ${sp.status === k ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}>
              {label} <span className="tabular-nums opacity-60">{counts[k as keyof typeof counts] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <form className="relative">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input name="q" defaultValue={sp.q} placeholder="Search name, email or subject" className="input w-72 pl-9" />
        </form>
      </div>

      <div className="card overflow-x-auto">
        {emails.length ? (
          <table className="data-table">
            <thead>
              <tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr>
            </thead>
            <tbody>
              {emails.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-stone-600">{fmtDateTime(e.createdAt)}</td>
                  <td>
                    <p className="font-medium">{e.toName || e.to}</p>
                    <p className="text-xs text-stone-500">{e.to}</p>
                  </td>
                  <td><Link href={`/admin/emails/${e.id}`} className="font-medium hover:underline">{e.subject}</Link></td>
                  <td>
                    <Badge tone={STATUS_TONE[e.status as keyof typeof STATUS_TONE]}>{EMAIL_STATUSES[e.status as keyof typeof EMAIL_STATUSES]}</Badge>
                    {e.reason && <p className="mt-1 max-w-56 text-xs text-stone-500">{e.reason}</p>}
                    {e.retriedAt && <p className="mt-1 text-xs text-stone-500">Sent again by {e.retriedByName}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon={Mail}>No emails yet.</Empty>
        )}
      </div>
    </>
  );
}
