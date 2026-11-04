"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { proposeMovement } from "@/server/services/movements";

export async function proposeMovementAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    id = await proposeMovement(await requireCtx(), Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$"))));
  });
  if (result.error) return result;
  revalidatePath("/", "layout");
  redirect(`/promotions/${id}`);
}
