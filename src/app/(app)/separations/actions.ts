"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { signClearance, startSeparation, submitExitInterview, withdrawSeparation } from "@/server/services/separations";

const form = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));

export async function startSeparationAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    id = await startSeparation(await requireCtx(), form(fd));
  });
  if (result.error) return result;
  revalidatePath("/", "layout");
  redirect(`/separations/${id}`);
}

export async function signClearanceAction(id: string, itemId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const completed = await signClearance(await requireCtx(), id, itemId, String(fd.get("note") ?? ""));
    revalidatePath("/", "layout");
    return { ok: completed ? "Signed. That was the last item: the record is closed and their login disabled." : "Signed off." };
  });
}

export async function exitInterviewAction(id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await submitExitInterview(await requireCtx(), id, form(fd));
    revalidatePath(`/separations/${id}`);
    return { ok: "Thank you. Only HR sees your answers." };
  });
}

export async function withdrawSeparationAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await withdrawSeparation(await requireCtx(), id);
    revalidatePath("/", "layout");
    return { ok: "Withdrawn." };
  });
}
