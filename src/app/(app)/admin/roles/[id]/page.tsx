import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { requireCtx } from "@/server/context";
import { canGrant } from "@/server/authz";
import { load, requirePermission } from "@/server/page";
import { getRole } from "@/server/services/roles";
import { allGrantStrings } from "@/lib/permissions";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { Badge, PageHeader } from "@/components/ui";
import { PermissionMatrix } from "../PermissionMatrix";
import { deleteRoleAction, updateRoleAction } from "../actions";

export const metadata: Metadata = { title: "Role" };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  await requirePermission(ctx, "role:manage");
  const role = await load(getRole(ctx, id));
  const grantable = allGrantStrings().filter((g) => canGrant(ctx, g));

  return (
    <>
      <PageHeader
        title={role.name}
        subtitle={role.description}
        back={{ href: "/admin/roles", label: "Roles" }}
        actions={role.system && <Badge>Built-in role</Badge>}
      />

      <div className="grid gap-6 2xl:grid-cols-[1fr_20rem]">
        {role.superAdmin ? (
          <section className="card p-6">
            <p className="flex items-center gap-2 font-medium"><Lock className="size-4" /> Every permission, at every scope</p>
            <p className="mt-2 text-sm text-stone-500">
              Super Admin is fixed so the system always has someone who can fix access. It can&apos;t be edited or
              deleted, only another Super Admin can give it out, and the last active Super Admin can&apos;t be removed.
            </p>
          </section>
        ) : (
          <ActionForm action={updateRoleAction.bind(null, role.id)} className="card overflow-hidden">
            <div className="grid gap-4 border-b border-stone-200 p-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" name="name" defaultValue={role.name} readOnly={role.system} className="input read-only:bg-stone-50" />
                <FieldError name="name" />
              </div>
              <div>
                <label className="label" htmlFor="description">Description</label>
                <input id="description" name="description" defaultValue={role.description} className="input" />
              </div>
            </div>
            <PermissionMatrix initial={role.grants} grantable={grantable} />
            <div className="flex justify-end border-t border-stone-200 p-4">
              <button className="btn-primary">Save role</button>
            </div>
          </ActionForm>
        )}

        <aside className="space-y-6">
          <section className="card overflow-hidden">
            <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">People with this role ({role.members.length})</h2>
            <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto text-sm">
              {role.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-4 py-2">
                  <Link href={`/admin/users/${m.id}`} className="hover:underline">{m.name}</Link>
                  {m.status !== "active" && <Badge tone="red">Disabled</Badge>}
                </li>
              ))}
              {!role.members.length && <li className="px-4 py-6 text-center text-stone-500">Nobody yet.</li>}
            </ul>
          </section>
          {!role.system && (
            <ActionForm action={deleteRoleAction.bind(null, role.id)} confirm={`Delete the role "${role.name}"?`}>
              <button className="btn-danger w-full">Delete role</button>
            </ActionForm>
          )}
        </aside>
      </div>
    </>
  );
}
