import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { orgChart, type OrgNode } from "@/server/services/employees";
import { PageHeader } from "@/components/ui";
import { Avatar } from "@/components/people";

export const metadata: Metadata = { title: "Org chart" };

function count(n: OrgNode): number {
  return n.children.reduce((s, c) => s + 1 + count(c), 0);
}

function Node({ node, depth }: { node: OrgNode; depth: number }) {
  const card = (
    <Link
      href={`/people/${node.id}`}
      className="flex w-80 max-w-full min-w-0 items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-xs hover:border-brand-400"
    >
      <Avatar name={node.name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{node.name}</span>
        <span className="block truncate text-xs text-stone-500">{node.jobTitle} · {node.department}</span>
      </span>
    </Link>
  );
  if (!node.children.length) return <li className="relative">{card}</li>;
  return (
    <li className="relative">
      <details open={depth < 2} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          {card}
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 group-open:bg-brand-100 group-open:text-brand-800">
            {count(node)} below
          </span>
        </summary>
        <ul className="mt-2 ml-5 space-y-2 border-l border-stone-200 pl-5">
          {node.children.map((c) => <Node key={c.id} node={c} depth={depth + 1} />)}
        </ul>
      </details>
    </li>
  );
}

export default async function OrgChartPage() {
  const ctx = await requireCtx();
  const roots = await load(orgChart(ctx));
  const total = roots.reduce((s, r) => s + 1 + count(r), 0);

  return (
    <>
      <PageHeader
        title="Org chart"
        subtitle={`Who reports to whom: ${total} ${total === 1 ? "person" : "people"} within your access. Tap a count to expand or collapse a team.`}
        back={{ href: "/people", label: "People" }}
      />
      <ul className="max-w-3xl space-y-2">
        {roots.map((r) => <Node key={r.id} node={r} depth={0} />)}
      </ul>
    </>
  );
}
