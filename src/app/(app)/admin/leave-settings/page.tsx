import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load, requirePermission } from "@/server/page";
import { leaveSettings } from "@/server/services/leave";
import { listEmployees } from "@/server/services/employees";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { Badge, PageHeader, fmtDate } from "@/components/ui";
import { addHolidayAction, adjustBalanceAction, removeHolidayAction, updateLeaveTypeAction } from "../../leave/actions";

export const metadata: Metadata = { title: "Leave settings" };

function Num({ id, name, label, value, step = 1 }: { id: string; name: string; label: string; value: number; step?: number }) {
  return (
    <div>
      <label className="label text-xs" htmlFor={`${id}-${name}`}>{label}</label>
      <input id={`${id}-${name}`} name={name} type="number" min={0} step={step} defaultValue={value} className="input" />
      <FieldError name={name} />
    </div>
  );
}

export default async function LeaveSettingsPage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "leave:manage");
  const [{ types, extra, holidays }, people] = await Promise.all([load(leaveSettings(ctx)), load(listEmployees(ctx))]);
  const extraDates = new Set(extra.map((h) => h.date));

  return (
    <>
      <PageHeader
        title="Leave settings"
        subtitle="Policies are data: change an entitlement here and every balance updates, because balances are always worked out fresh, never stored."
      />

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Leave types</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {types.map((t) => (
            <ActionForm key={t.code} action={updateLeaveTypeAction.bind(null, t.code)} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-stone-500">{t.description}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge>{t.dayCount === "calendar" ? "Calendar days" : "Working days"}</Badge>
                  {t.gender !== "any" && <Badge tone="violet">{t.gender === "female" ? "Women" : "Men"}</Badge>}
                  {t.proRata && <Badge tone="blue">Pro-rata for joiners</Badge>}
                  {!t.paid && <Badge tone="amber">Unpaid</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                <Num id={t.code} name="daysPerYear" label="Days / year" value={t.daysPerYear} step={0.5} />
                <Num id={t.code} name="carryOverMax" label="Max carry-over" value={t.carryOverMax} step={0.5} />
                <Num id={t.code} name="minServiceMonths" label="Months before eligible" value={t.minServiceMonths} />
                <Num id={t.code} name="backdateDays" label="Can backdate (days)" value={t.backdateDays} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={t.active} className="accent-brand-600" /> In use
                </label>
                <button className="btn-secondary">Save</button>
              </div>
            </ActionForm>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-stone-200 px-4 py-3">
            <h2 className="font-semibold">Public holidays</h2>
            <p className="text-sm text-stone-500">Fixed holidays and Easter are calculated. Add Eid and one-off gazetted days here.</p>
          </div>
          <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto text-sm">
            {holidays.map((h) => {
              const custom = extra.find((x) => x.date === h.date);
              return (
                <li key={h.date + h.name} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span>{fmtDate(h.date)} · {h.name}</span>
                  {custom ? (
                    <ActionForm action={removeHolidayAction.bind(null, custom.id)} confirm={`Remove ${h.name}?`}>
                      <button className="text-stone-400 hover:text-red-600" aria-label={`Remove ${h.name}`}><Trash2 className="size-4" /></button>
                    </ActionForm>
                  ) : (
                    !extraDates.has(h.date) && <span className="text-xs text-stone-400">by law</span>
                  )}
                </li>
              );
            })}
          </ul>
          <ActionForm action={addHolidayAction} className="grid gap-3 border-t border-stone-200 p-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <div>
              <label className="label text-xs" htmlFor="h-date">Date</label>
              <input id="h-date" name="date" type="date" required className="input" />
              <FieldError name="date" />
            </div>
            <div>
              <label className="label text-xs" htmlFor="h-name">Name</label>
              <input id="h-name" name="name" required placeholder="e.g. Idd-ul-Fitr" className="input" />
              <FieldError name="name" />
            </div>
            <button className="btn-secondary">Add</button>
          </ActionForm>
        </section>

        <section className="card self-start p-4">
          <h2 className="font-semibold">Adjust a balance</h2>
          <p className="mb-4 text-sm text-stone-500">
            For corrections, e.g. +1 day in lieu for working on a public holiday. Always needs a reason, and goes in the audit trail.
          </p>
          <ActionForm action={adjustBalanceAction} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label text-xs" htmlFor="a-emp">Employee</label>
              <select id="a-emp" name="employeeId" required className="input" defaultValue="">
                <option value="" disabled>Choose…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.staffNo})</option>)}
              </select>
              <FieldError name="employeeId" />
            </div>
            <div>
              <label className="label text-xs" htmlFor="a-type">Leave type</label>
              <select id="a-type" name="typeCode" className="input">
                {types.filter((t) => t.active).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs" htmlFor="a-days">Days (+ or −)</label>
              <input id="a-days" name="days" type="number" step={0.5} required className="input" />
              <FieldError name="days" />
            </div>
            <div className="sm:col-span-2">
              <label className="label text-xs" htmlFor="a-reason">Reason</label>
              <input id="a-reason" name="reason" required className="input" placeholder="Worked on Mashujaa Day" />
              <FieldError name="reason" />
            </div>
            <div className="sm:col-span-2 flex justify-end"><button className="btn-primary">Adjust</button></div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
