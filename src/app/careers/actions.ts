"use server";

import { redirect } from "next/navigation";
import { clientIp } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { candidateRespond, submitApplication } from "@/server/services/recruitment";

/** Public: no login. All the protection lives in submitApplication(). */
export async function applyAction(slug: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let token = "";
  const result = await runAction(async () => {
    const file = fd.get("cv");
    const cv = file instanceof File && file.size > 0 ? { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name } : null;
    const fields = Object.fromEntries([...fd.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$"))) as Record<string, string>;
    ({ token } = await submitApplication(slug, fields, cv, await clientIp()));
  });
  if (result.error) return result;
  redirect(`/careers/status/${token}?new=1`);
}

export async function respondAction(token: string, action: "accept" | "decline" | "withdraw"): Promise<ActionResult> {
  const result = await runAction(async () => {
    await candidateRespond(token, action, await clientIp());
  });
  if (result.error) return result;
  redirect(`/careers/status/${token}`);
}
