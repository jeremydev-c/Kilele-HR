"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { decide } from "@/server/services/approvals";

/** Approve or reject any request that goes through the approval engine (leave, requisitions, …). */
export async function decideAction(type: string, id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const form = Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));
    const status = await decide(await requireCtx(), type, id, form);
    revalidatePath("/", "layout"); // the request page, the inbox and the menu badge
    return {
      ok: status === "approved" ? "Approved. The request is complete." : status === "rejected" ? "Rejected. The requester can see your reason." : "Approved. It has moved to the next step.",
      href: "/approvals",
    };
  });
}
