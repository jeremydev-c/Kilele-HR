import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { EMAIL_STATUSES, STATUS_TONE, getEmail, relatedHref } from "@/server/services/emails";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Email" };

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "email:read");
  const e = await load(getEmail(ctx, (await params).id));
  const related = relatedHref(e.entity, e.entityId);

  return (
    <>
      <PageHeader title={e.subject} back={{ href: "/admin/emails", label: "Emails" }} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* The email exactly as it was sent; sandboxed so nothing in it can run. */}
        <iframe title="Email preview" srcDoc={e.html} sandbox="" className="h-[760px] w-full rounded-[20px] border border-stone-200 bg-stone-50" />
        <aside className="card h-fit space-y-4 p-5 text-sm">
          <div>
            <p className="text-stone-500">To</p>
            <p className="font-medium">{e.toName || e.to}</p>
            <p className="text-stone-500">{e.to}</p>
          </div>
          <div>
            <p className="text-stone-500">Written</p>
            <p className="font-medium">{fmtDateTime(e.createdAt)}</p>
          </div>
          <div>
            <p className="text-stone-500">Status</p>
            <Badge tone={STATUS_TONE[e.status as keyof typeof STATUS_TONE]}>{EMAIL_STATUSES[e.status as keyof typeof EMAIL_STATUSES]}</Badge>
            {e.reason && <p className="mt-1 text-stone-500">{e.reason}</p>}
          </div>
          {related && <Link href={related} className="btn-secondary w-full">Open what it&apos;s about</Link>}
        </aside>
      </div>
    </>
  );
}
