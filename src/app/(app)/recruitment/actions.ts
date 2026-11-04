"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import {
  createRequisition, createVacancy, hireCandidate, makeOffer, moveStage, scheduleInterview, setVacancyStatus, submitScorecard,
} from "@/server/services/recruitment";

const form = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));

export async function createRequisitionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    id = await createRequisition(await requireCtx(), form(fd));
  });
  if (result.error) return result;
  revalidatePath("/", "layout");
  redirect(`/recruitment/requisitions/${id}`);
}

export async function createVacancyAction(requisitionId: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    id = await createVacancy(await requireCtx(), requisitionId, form(fd));
  });
  if (result.error) return result;
  revalidatePath("/recruitment");
  redirect(`/recruitment/vacancies/${id}`);
}

export async function setVacancyStatusAction(id: string, status: "open" | "closed"): Promise<ActionResult> {
  return runAction(async () => {
    await setVacancyStatus(await requireCtx(), id, status);
    revalidatePath(`/recruitment/vacancies/${id}`);
    return { ok: status === "open" ? "The advert is live on the careers page." : "Closed: no new applications." };
  });
}

/** Every pipeline action follows the same shape, so one wrapper refreshes the right pages. */
function pipeline(fn: (id: string, data: Record<string, unknown>) => Promise<unknown>, ok: string) {
  return async (id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> =>
    runAction(async () => {
      const data: Record<string, unknown> = form(fd);
      const panel = fd.getAll("panelIds");
      if (panel.length) data.panelIds = panel.map(String);
      await fn(id, data);
      revalidatePath(`/recruitment/applications/${id}`);
      revalidatePath("/recruitment", "layout");
      return { ok };
    });
}

export async function moveStageAction(id: string, prev: ActionResult, fd: FormData) {
  return pipeline(async (i, d) => moveStage(await requireCtx(), i, d), "Updated.")(id, prev, fd);
}

export async function scheduleInterviewAction(id: string, prev: ActionResult, fd: FormData) {
  return pipeline(async (i, d) => scheduleInterview(await requireCtx(), i, d), "Interview scheduled. The candidate sees it on their status page.")(id, prev, fd);
}

export async function scorecardAction(id: string, prev: ActionResult, fd: FormData) {
  return pipeline(async (i, d) => submitScorecard(await requireCtx(), i, d), "Scorecard submitted. You can now see the rest of the panel's scores.")(id, prev, fd);
}

export async function offerAction(id: string, prev: ActionResult, fd: FormData) {
  return pipeline(async (i, d) => makeOffer(await requireCtx(), i, d), "Offer made. The candidate can accept it on their status page.")(id, prev, fd);
}

export async function hireAction(id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let employeeId = "";
  const result = await runAction(async () => {
    employeeId = await hireCandidate(await requireCtx(), id, form(fd));
  });
  if (result.error) return result;
  revalidatePath("/", "layout");
  redirect(`/people/${employeeId}`);
}
