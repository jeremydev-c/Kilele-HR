"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { checkChain } from "@/server/services/auditTrail";

export async function verifyChainAction(): Promise<ActionResult> {
  return runAction(async () => {
    const report = await checkChain(await requireCtx());
    revalidatePath("/admin/audit");
    return report.ok
      ? { ok: `Chain intact: all ${report.checked} entries match their hashes. Nothing has been edited or deleted.` }
      : { error: `Tampering detected at entry #${report.brokenAt}. ${report.problem} (The ${report.checked} ${report.checked === 1 ? "entry" : "entries"} before it ${report.checked === 1 ? "is" : "are"} intact.)` };
  });
}
