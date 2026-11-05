"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { sendAnnouncement } from "@/server/services/announcements";

export async function sendAnnouncementAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    const data: Record<string, unknown> = Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")));
    data.departmentIds = fd.getAll("departmentIds").map(String);
    data.employeeIds = fd.getAll("employeeIds").map(String);
    id = await sendAnnouncement(await requireCtx(), data);
  });
  if (result.error) return result;
  revalidatePath("/", "layout");
  redirect(`/announcements/${id}?sent=1`);
}
