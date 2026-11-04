import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Lock } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { listRoles } from "@/server/services/roles";
import { Badge, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "role:manage");
  const roles = await load(listRoles(ctx));

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="A role is a named bundle of permissions. Each person's access is the sum of their roles."
        actions={
          <Link href="/admin/roles/new" className="btn-primary">
            <Plus className="size-4" /> New role
          </Link>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {roles.map((r) => (
          <Link key={r.id} href={`/admin/roles/${r.id}`} className="card block p-5 transition-colors hover:border-brand-300">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{r.name}</h2>
              <div className="flex gap-1">
                {r.system && <Badge>Built-in</Badge>}
                {r.superAdmin && <Badge tone="violet"><Lock className="mr-1 size-3" />All access</Badge>}
              </div>
            </div>
            <p className="mt-1 text-sm text-stone-500">{r.description}</p>
            <p className="mt-4 text-xs text-stone-500">
              {r.superAdmin ? "Every permission" : `${r.grants.length} permission${r.grants.length === 1 ? "" : "s"}`} ·{" "}
              {r.users} active user{r.users === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
