"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import {
  acknowledgeReview, closeCycle, setGoals, startCycle, submitManagerReview, submitSelfReview,
} from "@/server/services/performance";

const form = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));

export async function startCycleAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    id = await startCycle(await requireCtx(), form(fd));
  });
  if (result.error) return result;
  revalidatePath("/", "layout");
  redirect(`/performance/cycles/${id}`);
}

export async function closeCycleAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const unfinished = await closeCycle(await requireCtx(), id);
    revalidatePath("/", "layout");
    return { ok: unfinished ? `Closed. ${unfinished} unfinished review${unfinished === 1 ? " is" : "s are"} frozen where they got to.` : "Closed. Every review was finished." };
  });
}

/** Every step of a review has the same shape. */
function step(fn: (id: string, data: Record<string, unknown>) => Promise<void>, ok: string) {
  return async (id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> =>
    runAction(async () => {
      await fn(id, form(fd));
      revalidatePath("/", "layout");
      return { ok };
    });
}

export async function setGoalsAction(id: string, prev: ActionResult, fd: FormData) {
  return step(async (i, d) => setGoals(await requireCtx(), i, d), "Goals set. They've been asked to rate themselves.")(id, prev, fd);
}

export async function selfReviewAction(id: string, prev: ActionResult, fd: FormData) {
  return step(async (i, d) => submitSelfReview(await requireCtx(), i, d), "Submitted. Your manager has been asked to review you.")(id, prev, fd);
}

export async function managerReviewAction(id: string, prev: ActionResult, fd: FormData) {
  return step(async (i, d) => submitManagerReview(await requireCtx(), i, d), "Submitted. They've been asked to read it and sign it off.")(id, prev, fd);
}

export async function acknowledgeAction(id: string, prev: ActionResult, fd: FormData) {
  return step(async (i, d) => acknowledgeReview(await requireCtx(), i, d), "Signed off. Your review is complete.")(id, prev, fd);
}
