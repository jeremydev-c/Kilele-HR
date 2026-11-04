"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCtx } from "@/server/context";
import { runAction, type ActionResult } from "@/server/errors";
import { createRole, deleteRole, updateRole } from "@/server/services/roles";

function roleInput(fd: FormData) {
  return { name: fd.get("name"), description: fd.get("description") ?? "", grants: fd.getAll("grants").map(String) };
}

export async function createRoleAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const result = await runAction(async () => {
    id = await createRole(await requireCtx(), roleInput(fd));
  });
  if (result.error) return result;
  revalidatePath("/admin/roles");
  redirect(`/admin/roles/${id}`);
}

export async function updateRoleAction(id: string, _prev: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await updateRole(await requireCtx(), id, roleInput(fd));
    revalidatePath("/admin/roles");
    revalidatePath(`/admin/roles/${id}`);
    return { ok: "Role saved. Everyone with this role gets the change on their next page load." };
  });
}

export async function deleteRoleAction(id: string): Promise<ActionResult> {
  const result = await runAction(async () => {
    await deleteRole(await requireCtx(), id);
  });
  if (result.error) return result;
  revalidatePath("/admin/roles");
  redirect("/admin/roles");
}
