import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { canGrant } from "@/server/authz";
import { requirePermission } from "@/server/page";
import { allGrantStrings } from "@/lib/permissions";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { PermissionMatrix } from "../PermissionMatrix";
import { createRoleAction } from "../actions";

export const metadata: Metadata = { title: "New role" };

export default async function NewRolePage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "role:manage");
  const grantable = allGrantStrings().filter((g) => canGrant(ctx, g));

  return (
    <>
      <PageHeader title="New role" back={{ href: "/admin/roles", label: "Roles" }} />
      <ActionForm action={createRoleAction} className="card overflow-hidden">
        <div className="grid gap-4 border-b border-stone-200 p-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="e.g. Payroll Officer" className="input" />
            <FieldError name="name" />
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <input id="description" name="description" placeholder="What this role is for" className="input" />
          </div>
        </div>
        <PermissionMatrix initial={[]} grantable={grantable} />
        <div className="flex justify-end border-t border-stone-200 p-4">
          <button className="btn-primary">Create role</button>
        </div>
      </ActionForm>
    </>
  );
}
