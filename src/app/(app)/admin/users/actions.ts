"use server";

import { revalidatePath } from "next/cache";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import {
  createUser, resetPassword, revokeSessions, setUserRoles, setUserStatus, unlockUser,
} from "@/server/services/users";

export async function createUserAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireCtx();
    const { id, password } = await createUser(ctx, {
      name: fd.get("name"),
      email: fd.get("email"),
      roleIds: fd.getAll("roleIds"),
      employeeId: fd.get("employeeId") ?? "",
    });
    revalidatePath("/", "layout");
    // Shown on this form once and never stored in clear or put in a URL.
    return {
      ok: "Account created. Give them this temporary password; they must change it at first sign-in. It won't be shown again:",
      secret: password,
      href: `/admin/users/${id}`,
    };
  });
}

export async function setRolesAction(id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await setUserRoles(await requireCtx(), id, fd.getAll("roleIds").map(String));
    revalidatePath("/", "layout");
    return { ok: "Roles updated. They apply on the user's next page load." };
  });
}

export async function setStatusAction(id: string, status: "active" | "disabled"): Promise<ActionResult> {
  return runAction(async () => {
    await setUserStatus(await requireCtx(), id, status);
    revalidatePath("/", "layout");
    return { ok: status === "disabled" ? "Account disabled and signed out everywhere." : "Account re-enabled." };
  });
}

export async function unlockAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await unlockUser(await requireCtx(), id);
    revalidatePath("/", "layout");
    return { ok: "Account unlocked." };
  });
}

export async function resetPasswordAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const password = await resetPassword(await requireCtx(), id);
    revalidatePath("/", "layout");
    return { ok: "Password reset. Give them this temporary password; it's shown only once:", secret: password };
  });
}

export async function revokeSessionsAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await revokeSessions(await requireCtx(), id);
    revalidatePath("/", "layout");
    return { ok: "Signed out of every device." };
  });
}
