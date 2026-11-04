import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { requirePermission } from "@/server/page";
import { listRoles } from "@/server/services/roles";
import { listUnlinkedEmployees } from "@/server/services/users";
import { PageHeader } from "@/components/ui";
import { NewUserForm } from "./NewUserForm";

export const metadata: Metadata = { title: "New account" };

export default async function NewUserPage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "user:manage");
  const [roles, employees] = await Promise.all([listRoles(ctx), listUnlinkedEmployees(ctx)]);

  return (
    <>
      <PageHeader title="New account" back={{ href: "/admin/users", label: "Users" }} />
      <NewUserForm
        employees={employees}
        roles={roles.map((r) => ({ id: r.id, name: r.name, description: r.description, assignable: r.assignable }))}
      />
    </>
  );
}
