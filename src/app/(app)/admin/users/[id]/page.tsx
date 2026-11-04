import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { canGrant, has } from "@/server/authz";
import { load } from "@/server/page";
import { getUser } from "@/server/services/users";
import { listRoles } from "@/server/services/roles";
import { connectDB } from "@/lib/db";
import { AuditLog } from "@/server/models/AuditLog";
import { ActionForm } from "@/components/ActionForm";
import { AccessTable } from "@/components/AccessTable";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import {
  resetPasswordAction, revokeSessionsAction, setRolesAction, setStatusAction, unlockAction,
} from "../actions";

export const metadata: Metadata = { title: "Account" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const user = await load(getUser(ctx, id));
  // Same rule the server enforces: you can only manage an account whose access you could grant.
  const outranksMe = ![...user.roles.flatMap((r) => r.grants), ...user.extraGrants].every((g) => canGrant(ctx, g));
  const canManage = has(ctx, "user:manage") && !outranksMe;
  const isSelf = user.id === ctx.userId;
  const roles = canManage ? await listRoles(ctx) : [];

  await connectDB();
  const history = has(ctx, "audit:read")
    ? await AuditLog.find({ $or: [{ entityId: user.id }, { actorId: user.id }] }).sort({ seq: -1 }).limit(10).lean()
    : null;

  return (
    <>
      <PageHeader
        title={user.name}
        subtitle={user.email}
        back={{ href: "/admin/users", label: "Users" }}
        actions={
          <div className="flex flex-wrap gap-1">
            {user.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
            {user.locked && <Badge tone="amber">Locked until {fmtDateTime(user.lockedUntil)}</Badge>}
            {user.mustChangePassword && <Badge tone="blue">Must change password</Badge>}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold">Account</h2>
            <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-stone-500">Employee</dt>
              <dd>{user.employee ? `${user.employee.name} · ${user.employee.staffNo} · ${user.employee.jobTitle}` : "Not linked"}</dd>
              <dt className="text-stone-500">Last sign-in</dt>
              <dd>{fmtDateTime(user.lastLoginAt)}</dd>
              <dt className="text-stone-500">Created</dt>
              <dd>{fmtDateTime(user.createdAt)}</dd>
            </dl>

            {outranksMe && has(ctx, "user:manage") && (
              <p className="mt-5 border-t border-stone-100 pt-4 text-sm text-stone-500">
                This account has more access than you do, so only someone with at least the same access can change it.
              </p>
            )}
            {canManage && !isSelf && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
                {user.locked && (
                  <ActionForm action={unlockAction.bind(null, user.id)}>
                    <button className="btn-secondary">Unlock</button>
                  </ActionForm>
                )}
                <ActionForm action={resetPasswordAction.bind(null, user.id)} confirm={`Reset ${user.name}'s password? They'll be signed out everywhere.`}>
                  <button className="btn-secondary">Reset password</button>
                </ActionForm>
                <ActionForm action={revokeSessionsAction.bind(null, user.id)}>
                  <button className="btn-secondary">Sign out everywhere</button>
                </ActionForm>
                {user.status === "active" ? (
                  <ActionForm action={setStatusAction.bind(null, user.id, "disabled")} confirm={`Disable ${user.name}'s account? They'll be signed out immediately.`}>
                    <button className="btn-danger">Disable account</button>
                  </ActionForm>
                ) : (
                  <ActionForm action={setStatusAction.bind(null, user.id, "active")}>
                    <button className="btn-secondary">Re-enable account</button>
                  </ActionForm>
                )}
              </div>
            )}
          </section>

          {canManage && (
            <section className="card p-5">
              <h2 className="font-semibold">Roles</h2>
              {isSelf ? (
                <p className="mt-2 text-sm text-stone-500">You can&apos;t change your own roles. Another administrator has to.</p>
              ) : (
                <ActionForm action={setRolesAction.bind(null, user.id)} className="mt-3 space-y-2">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className={`flex gap-3 rounded-lg border p-3 text-sm ${r.assignable ? "border-stone-200 hover:bg-stone-50" : "border-stone-100 opacity-50"}`}
                      title={r.assignable ? undefined : "This role has permissions you don't hold."}
                    >
                      <input
                        type="checkbox"
                        name="roleIds"
                        value={r.id}
                        defaultChecked={user.roleIds.includes(r.id)}
                        disabled={!r.assignable}
                        className="mt-0.5 accent-brand-600"
                      />
                      <span>
                        <span className="block font-medium">{r.name}</span>
                        <span className="block text-xs text-stone-500">{r.description}</span>
                      </span>
                    </label>
                  ))}
                  <div className="flex justify-end pt-2">
                    <button className="btn-primary">Save roles</button>
                  </div>
                </ActionForm>
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="border-b border-stone-200 px-4 py-3">
              <h2 className="font-semibold">Effective access</h2>
              <p className="text-sm text-stone-500">Everything this account can do, and which role gives it.</p>
            </div>
            <AccessTable
              sources={[
                ...user.roles.map((r) => ({ name: r.name, grants: r.grants })),
                ...(user.extraGrants.length ? [{ name: "Granted directly", grants: user.extraGrants }] : []),
              ]}
            />
          </section>

          {history && (
            <section className="card overflow-hidden">
              <h2 className="border-b border-stone-200 px-4 py-3 font-semibold">Recent audit entries</h2>
              <ul className="divide-y divide-stone-100 text-sm">
                {history.map((e) => (
                  <li key={e.seq} className="px-4 py-2.5">
                    <p><span className="font-medium">{e.actorName}</span> · {e.summary}</p>
                    <p className="text-xs text-stone-500">#{e.seq} · {e.action} · {fmtDateTime(e.at)}</p>
                  </li>
                ))}
                {!history.length && <li className="px-4 py-6 text-center text-stone-500">No activity yet.</li>}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
