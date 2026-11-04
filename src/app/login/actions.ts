"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { login } from "@/server/services/auth";
import { clientIp } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { SESSION_COOKIE, SESSION_TTL, cookieOptions, signSession } from "@/lib/session";

/** Only same-site paths, so ?next= can't bounce someone to another website. */
function safeNext(raw: FormDataEntryValue | null): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/dashboard";
}

export async function loginAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let dest = safeNext(fd.get("next"));
  const result = await runAction(async () => {
    const r = await login({ email: fd.get("email"), password: fd.get("password") }, await clientIp());
    (await cookies()).set(SESSION_COOKIE, await signSession(r.userId, r.sessionVersion), cookieOptions(SESSION_TTL));
    if (r.mustChangePassword) dest = "/change-password";
  });
  if (result.error) return result;
  redirect(dest);
}
