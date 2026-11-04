import type { Metadata } from "next";
import { CalendarDays, CheckCircle2, DoorOpen, Briefcase, TrendingUp } from "lucide-react";
import { requireCtx } from "@/server/context";
import { inbox } from "@/server/services/approvals";
import { Empty, ListRow, PageHeader, fmtDate } from "@/components/ui";

export const metadata: Metadata = { title: "Approvals" };

const ICON = { leave: CalendarDays, requisition: Briefcase, promotion: TrendingUp, separation: DoorOpen } as const;

export default async function ApprovalsPage() {
  const ctx = await requireCtx();
  const items = await inbox(ctx);

  return (
    <>
      <PageHeader title="Approvals" subtitle={items.length ? `${items.length} waiting` : undefined} />
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
