import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, DoorOpen, Briefcase, TrendingUp } from "lucide-react";
import { requireCtx } from "@/server/context";
import { inbox } from "@/server/services/approvals";
import { Empty, ListRow, PageHeader, fmtDate } from "@/components/ui";

export const metadata: Metadata = { title: "Approvals" };

const ICON = { leave: CalendarDays, requisition: Briefcase, promotion: TrendingUp, separation: DoorOpen } as const;

/** What the banner says after a decision (decideAction sends you here). */
const DONE: Record<string, string> = {
  approved: "Approved. The request is complete and has left your inbox.",
  next: "Approved. It has moved on to the next approver.",
  rejected: "Declined. The requester can see your reason.",
};
const NEXT: Record<string, { label: string; href: (id: string) => string }> = {
  requisition: { label: "Write the advert", href: (id) => `/recruitment/vacancies/new?req=${id}` },
};

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ done?: string; type?: string; id?: string }> }) {
  const ctx = await requireCtx();
  const [items, { done, type, id }] = await Promise.all([inbox(ctx), searchParams]);
  const next = done === "approved" && type && id && /^[a-f0-9]{24}$/.test(id) ? NEXT[type] : undefined;

  return (
    <>
      <PageHeader title="Approvals" subtitle={items.length ? `${items.length} waiting` : undefined} />
      {done && DONE[done] && (
        <p role="status" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span className="flex-1">{DONE[done]}</span>
          {next && <Link href={next.href(id!)} className="font-medium underline-offset-4 hover:underline">{next.label} →</Link>}
        </p>
      )}
      <div className="card divide-y divide-stone-100 overflow-hidden">
        {items.map((it) => {
          const Icon = ICON[it.type as keyof typeof ICON] ?? CalendarDays;
          return (
            <ListRow key={`${it.type}-${it.id}`} href={it.href} trailing={<span className="hidden text-xs text-stone-400 sm:inline">{fmtDate(it.requestedAt)}</span>}>
              <span className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600"><Icon className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{it.title}</span>
                  <span className="block truncate text-sm text-stone-500">{it.label} · {it.detail}</span>
                </span>
              </span>
            </ListRow>
          );
        })}
        {!items.length && <Empty icon={CheckCircle2}>Nothing needs your approval.</Empty>}
      </div>
    </>
  );
}
