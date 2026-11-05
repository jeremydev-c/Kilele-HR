import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { Send } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { deliveryBlock } from "@/server/email/send";
import { EMAIL_STATUSES, STATUS_TONE, getEmail, relatedHref } from "@/server/services/emails";
import { resendEmailAction } from "../actions";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Email" };

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "email:read");
  const e = await load(getEmail(ctx, (await params).id));
  const related = relatedHref(e.entityId ? e.entity : null, e.entityId);
  const canResend = ["saved", "failed"].includes(e.status) && !e.retriedAt && !deliveryBlock(e.to);

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
          {e.retriedAt && <p className="text-stone-500">Sent again by {e.retriedByName}. The new attempt is the newest entry in the list.</p>}
          {canResend && (
            <ActionForm action={resendEmailAction.bind(null, e.id)}>
              <button className="btn-primary w-full"><Send className="size-4" /> Send again</button>
            </ActionForm>
          )}
          {related && <Link href={related} className="btn-secondary w-full">Open what it&apos;s about</Link>}
        </aside>
      </div>
    </>
  );
}
