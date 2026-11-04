import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Role } from "@/server/models/Role";
import { AccessTable } from "@/components/AccessTable";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "My access" };

export default async function MyAccessPage() {
  const ctx = await requireCtx();
  await connectDB();
  const me = await User.findById(ctx.userId).select("roleIds extraGrants").lean();
  const roles = await Role.find({ _id: { $in: me?.roleIds ?? [] } }).select("name grants").lean();
  const sources = [
    ...roles.map((r) => ({ name: r.name, grants: r.grants })),
    ...(me?.extraGrants.length ? [{ name: "Granted directly", grants: me.extraGrants }] : []),
  ];

  return (
    <>
      <PageHeader title="My access" subtitle={ctx.roleNames.join(" · ")} />
      <section className="card overflow-hidden">
        <AccessTable sources={sources} />
      </section>
    </>
  );
}
