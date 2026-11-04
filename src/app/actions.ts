"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCtx } from "@/server/context";
import { logout } from "@/server/services/auth";
import { SESSION_COOKIE } from "@/lib/session";

export async function logoutAction() {
  const ctx = await getCtx();
  if (ctx) await logout(ctx);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
