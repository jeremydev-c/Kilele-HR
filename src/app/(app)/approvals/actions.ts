"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { decide } from "@/server/services/approvals";

/**
 * Approve or reject any request that goes through the approval engine (leave, requisitions, …).
 * On success it goes back to the inbox, where the request is visibly gone and a banner says what happened.
 */
export async function decideAction(type: string, id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let status = "";
  const result = await runAction(async () => {
    const form = Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));
    status = await decide(await requireCtx(), type, id, form);
  });
  if (result.error) return result;
  revalidatePath("/", "layout"); // the request page, the inbox and the menu badge
  const done = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "next";
  redirect(`/approvals?done=${done}&type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`);
}
