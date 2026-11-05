"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { resendEmail, resendUnsent } from "@/server/services/emails";

const SAID = {
  sent: "Sent. It's on its way.",
  failed: "Resend refused it again. The newest copy in the list says why.",
  skipped: "Not sent: that's a test or demo address.",
  saved: "Saved again, but email sending is off.",
} as const;

export async function resendEmailAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const status = await resendEmail(await requireCtx(), id);
    revalidatePath("/", "layout");
    return { ok: status ? SAID[status] : "Someone else already sent this one again.", href: "/admin/emails" };
  });
}

export async function resendUnsentAction(): Promise<ActionResult> {
  return runAction(async () => {
    const t = await resendUnsent(await requireCtx());
    revalidatePath("/", "layout");
    const total = t.sent + t.failed + t.other;
    if (!total) return { ok: "Nothing left to send: every email to a real address has gone out." };
    return { ok: `Tried ${total}: ${t.sent} sent${t.failed ? `, ${t.failed} refused by Resend (see Failed)` : ""}.` };
  });
}
