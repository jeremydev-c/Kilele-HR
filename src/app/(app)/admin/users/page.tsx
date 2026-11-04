import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Plus, Search } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { load } from "@/server/page";
import { listUsers } from "@/server/services/users";
import { Badge, Empty, PageHeader, fmtDateTime } from "@/components/ui";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const { q = "" } = await searchParams;
  const users = await load(listUsers(ctx, q));

  return (
    <>
      <PageHeader
        title="User accounts"
        subtitle="Who can sign in, and with which roles."
        actions={
          has(ctx, "user:manage") && (
            <Link href="/admin/users/new" className="btn-primary">
              <Plus className="size-4" /> New account
            </Link>
          )
        }
      />

      <form className="mb-4 flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input name="q" defaultValue={q} placeholder="Search name or email" className="input pl-9" />
        </div>
        <button className="btn-secondary">Search</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Roles</th>
              <th>Status</th>
              <th className="hidden md:table-cell">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-stone-50">
                <td>
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-brand-800 hover:underline">{u.name}</Link>
                  <p className="text-xs text-stone-500">{u.email}</p>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => <Badge key={r} tone={r === "Super Admin" ? "violet" : "gray"}>{r}</Badge>)}
                  </div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {u.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
                    {u.locked && <Badge tone="amber"><Lock className="mr-1 size-3" />Locked</Badge>}
                    {u.mustChangePassword && <Badge tone="blue">Temp password</Badge>}
                  </div>
                </td>
                <td className="hidden text-stone-500 md:table-cell">{fmtDateTime(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && <Empty>No accounts match “{q}”.</Empty>}
      </div>
    </>
  );
}
