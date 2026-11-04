import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireCtx } from "@/server/context";
import { inbox } from "@/server/services/approvals";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireCtx();
  const items = await inbox(ctx);

  return (
    <>
      <PageHeader
        title="My approvals"
        subtitle="Everything waiting for your decision, across leave, hiring, promotions and exits. Open one to see the details before you decide."
      />
      {items.length ? (
        <ul className="card divide-y divide-stone-100 overflow-hidden">
          {items.map((it) => (
            <li key={`${it.type}-${it.id}`}>
              <Link href={it.href} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <Badge tone="blue">{it.label}</Badge>
                    <span className="font-medium">{it.title}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-stone-500">{it.detail}</span>
                </span>
                <span className="text-right text-xs text-stone-500">
                  <span className="block">Your step: <b className="text-stone-700">{it.step}</b></span>
                  <span className="block">Submitted {fmtDateTime(it.requestedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <Inbox className="size-10 text-stone-300" />
          <p className="mt-3 font-medium">Nothing waiting for you</p>
          <p className="text-sm text-stone-500">When someone&apos;s request reaches a step you approve, it shows up here.</p>
        </div>
      )}
    </>
  );
}
