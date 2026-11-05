"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import {
  addHoliday, adjustBalance, applyLeave, cancelLeave, removeHoliday, updateLeaveType,
} from "@/server/services/leave";

const form = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));

export async function applyLeaveAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    id = await applyLeave(await requireCtx(), form(fd));
  });
  if (result.error) return result;
  revalidatePath("/", "layout");
  redirect(`/leave/${id}?applied=1`);
}

export async function cancelLeaveAction(id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await cancelLeave(await requireCtx(), id, String(fd.get("reason") ?? ""));
    revalidatePath("/", "layout");
    return { ok: "Leave cancelled. The days are back in the balance." };
  });
}

export async function updateLeaveTypeAction(code: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await updateLeaveType(await requireCtx(), code, form(fd));
    revalidatePath("/", "layout");
    return { ok: "Saved." };
  });
}

export async function addHolidayAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await addHoliday(await requireCtx(), form(fd));
    revalidatePath("/", "layout");
    return { ok: "Holiday added. Working-day counts include it from now on." };
  });
}

export async function removeHolidayAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await removeHoliday(await requireCtx(), id);
    revalidatePath("/", "layout");
    return { ok: "Removed." };
  });
}

export async function adjustBalanceAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await adjustBalance(await requireCtx(), form(fd));
    revalidatePath("/", "layout");
    return { ok: "Balance adjusted and recorded in the audit trail." };
  });
}
