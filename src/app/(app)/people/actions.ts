"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import {
  createEmployee, revealPii, updateContact, updateDirectory, updatePay, updatePii,
} from "@/server/services/employees";

const form = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));

export async function createEmployeeAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const data = form(fd);
  if (data.basicSalary === "") delete data.basicSalary;
  const result = await runAction(async () => {
    id = await createEmployee(await requireCtx(), data);
  });
  if (result.error) return result;
  revalidatePath("/people");
  redirect(`/people/${id}`);
}

type Section = "directory" | "contact" | "pii" | "pay";
const UPDATERS = { directory: updateDirectory, contact: updateContact, pii: updatePii, pay: updatePay } as const;

export async function updateEmployeeAction(id: string, section: Section, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await UPDATERS[section](await requireCtx(), id, form(fd));
    revalidatePath(`/people/${id}`);
    revalidatePath("/people");
    return { ok: "Saved.", href: `/people/${id}` };
  });
}

export type RevealResult = { error?: string; values?: Record<string, string> };

export async function revealPiiAction(id: string, reason: string): Promise<RevealResult> {
  let values: Record<string, string> | undefined;
  const result = await runAction(async () => {
    values = await revealPii(await requireCtx(), id, { reason });
  });
  return result.error ? { error: result.error } : { values };
}
