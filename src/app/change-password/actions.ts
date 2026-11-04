"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { changePassword } from "@/server/services/auth";
import { runAction, type ActionResult } from "@/server/errors";
import { SESSION_COOKIE, SESSION_TTL, cookieOptions, signSession } from "@/lib/session";

export async function changePasswordAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const result = await runAction(async () => {
    const ctx = await requireCtx();
    const sv = await changePassword(ctx, Object.fromEntries(fd));
    // Other devices are now signed out; keep this one signed in with a fresh cookie.
    (await cookies()).set(SESSION_COOKIE, await signSession(ctx.userId, sv), cookieOptions(SESSION_TTL));
  });
  if (result.error) return result;
  redirect("/dashboard");
}
