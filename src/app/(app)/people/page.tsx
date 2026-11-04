import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Network } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { load } from "@/server/page";
import { listDepartments, listEmployees } from "@/server/services/employees";
import { Empty, PageHeader } from "@/components/ui";
import { Avatar, StatusBadge } from "@/components/people";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; status?: string }>;
}) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [people, depts] = await Promise.all([
    load(listEmployees(ctx, { q: sp.q, departmentId: sp.dept, status: sp.status })),
    listDepartments(),
  ]);
  const canPii = has(ctx, "employee.pii:read");

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`${people.length} ${people.length === 1 ? "person" : "people"} you can see. What you see depends on your access.`}
        actions={
          <>
            <Link href="/org-chart" className="btn-secondary"><Network className="size-4" /> Org chart</Link>
            {has(ctx, "employee:create") && (
              <Link href="/people/new" className="btn-primary"><Plus className="size-4" /> Add employee</Link>
            )}
          </>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-2.5 left-3 size-4 text-stone-400" />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder={canPii ? "Name, staff no., email or National ID" : "Name, staff no. or email"}
            className="input pl-9"
          />
        </div>
        <select name="dept" defaultValue={sp.dept ?? ""} className="input w-auto">
          <option value="">All departments</option>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? "current"} className="input w-auto">
          <option value="current">Current staff</option>
          <option value="probation">On probation</option>
          <option value="separated">Former staff</option>
          <option value="all">Everyone</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Job</th>
              <th className="hidden md:table-cell">Department</th>
              <th className="hidden lg:table-cell">Reports to</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50">
                <td>
                  <Link href={`/people/${p.id}`} className="flex items-center gap-3">
                    <Avatar name={p.fullName} size="sm" />
                    <span>
                      <span className="block font-medium text-brand-800 hover:underline">{p.fullName}</span>
                      <span className="block text-xs text-stone-500">{p.staffNo} · {p.workEmail}</span>
                    </span>
                  </Link>
                </td>
                <td>
                  <p>{p.jobTitle}</p>
                  <p className="text-xs text-stone-500">{p.gradeLabel}</p>
                </td>
                <td className="hidden md:table-cell">{p.departmentName}</td>
                <td className="hidden text-stone-600 lg:table-cell">{p.manager?.name ?? "—"}</td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!people.length && <Empty>No one matches. {sp.q && /^\d{7,8}$/.test(sp.q) && "National ID search only finds people whose personal details you're allowed to see."}</Empty>}
      </div>
    </>
  );
}
