import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightLeft, Briefcase, Lock, Pencil, TrendingDown, TrendingUp, UserCheck, UserMinus, UserPlus, Users, Wallet } from "lucide-react";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getEmployee } from "@/server/services/employees";
import { PII_FIELDS, PII_LABELS } from "@/server/employeeView";
import { gradeLabel } from "@/lib/grades";
import { Badge, PageHeader, fmtDate } from "@/components/ui";
import { Avatar, EMPLOYMENT_TYPES, StatusBadge, kes } from "@/components/people";
import { PiiPanel } from "../PiiPanel";

export const metadata: Metadata = { title: "Employee" };

function service(from: Date | string, to = new Date()) {
  const start = new Date(from);
  let months = (to.getFullYear() - start.getFullYear()) * 12 + (to.getMonth() - start.getMonth());
  if (to.getDate() < start.getDate()) months--;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} yr${y === 1 ? "" : "s"}`, m && `${m} mo`].filter(Boolean).join(" ") || "Under a month";
}

const EVENT_ICONS = {
  hire: UserPlus,
  promotion: TrendingUp,
  demotion: TrendingDown,
  transfer: ArrowRightLeft,
  manager_change: Users,
  salary_change: Wallet,
  status_change: UserCheck,
  separation: UserMinus,
} as const;

function Section({ title, children, edit }: { title: string; children: React.ReactNode; edit?: string }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {edit && (
          <Link href={edit} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
            <Pencil className="size-3.5" /> Edit
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Locked({ title, what }: { title: string; what: string }) {
  return (
    <section className="card border-dashed p-5 text-sm text-stone-500">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-stone-700"><Lock className="size-4" /> {title}</h2>
      Your access doesn&apos;t include {what} for this person, so it wasn&apos;t sent to your browser at all.
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd>{children || <span className="text-stone-400">—</span>}</dd>
    </div>
  );
}

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { view: e, managerVisible, reports, history } = await load(getEmployee(ctx, id));
  const editable = e.access.edit && e.status !== "separated";
  const editHref = (section: string) => (editable ? `/people/${e.id}/edit#${section}` : undefined);

  return (
    <>
      <PageHeader title={e.fullName} back={{ href: "/people", label: "People" }} />

      <section className="card mb-6 flex flex-wrap items-center gap-5 p-5">
        <Avatar name={e.fullName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{e.jobTitle}</p>
          <p className="text-sm text-stone-500">{e.departmentName} · {e.gradeLabel} · {e.staffNo}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge status={e.status} />
            <Badge>{EMPLOYMENT_TYPES[e.employmentType as keyof typeof EMPLOYMENT_TYPES]}</Badge>
            {e.access.own && <Badge tone="violet">You</Badge>}
          </div>
        </div>
        {editable && (
          <Link href={`/people/${e.id}/edit`} className="btn-secondary"><Pencil className="size-4" /> Edit</Link>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Section title="Employment" edit={editHref("directory")}>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Work email"><a href={`mailto:${e.workEmail}`} className="text-brand-700 hover:underline">{e.workEmail}</a></Field>
              <Field label="Gender">{e.gender === "female" ? "Female" : "Male"}</Field>
              <Field label="Started">{fmtDate(e.hireDate)} ({service(e.hireDate)})</Field>
              <Field label="Reports to">
                {e.manager ? (
                  managerVisible ? <Link href={`/people/${e.manager.id}`} className="text-brand-700 hover:underline">{e.manager.name}</Link> : e.manager.name
                ) : "No one (top of the organisation)"}
              </Field>
            </dl>
            {reports.length > 0 && (
              <div className="mt-4 border-t border-stone-100 pt-4">
                <p className="mb-2 text-sm text-stone-500">Direct reports ({reports.length})</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <Link href={`/people/${r.id}`} className="flex items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-stone-50">
                        <Avatar name={r.name} size="sm" />
                        <span><span className="block font-medium">{r.name}</span><span className="block text-xs text-stone-500">{r.jobTitle}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {e.contact ? (
            <Section title="Contact" edit={editHref("contact")}>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Field label="Phone">{e.contact.phone}</Field>
                <Field label="Personal email">{e.contact.personalEmail}</Field>
                <Field label="Address">{[e.contact.address, e.contact.town, e.contact.county].filter(Boolean).join(", ")}</Field>
                <Field label="Next of kin">
                  {e.contact.nextOfKin?.name && `${e.contact.nextOfKin.name} (${e.contact.nextOfKin.relationship}) · ${e.contact.nextOfKin.phone}`}
                </Field>
                <Field label="Emergency contact">
                  {e.contact.emergencyContact?.name && `${e.contact.emergencyContact.name} (${e.contact.emergencyContact.relationship}) · ${e.contact.emergencyContact.phone}`}
                </Field>
              </dl>
            </Section>
          ) : (
            <Locked title="Contact" what="contact details" />
          )}

          {e.pii ? (
            <Section title="Personal & statutory" edit={editHref("pii")}>
              <PiiPanel
                employeeId={e.id}
                own={e.access.own}
                fields={PII_FIELDS.map((f) => ({ key: f, label: PII_LABELS[f], masked: e.pii![f] }))}
              />
              {e.pii.retirementDate && (
                <p className="mt-3 text-xs text-stone-500">Retirement date (age 60): {fmtDate(e.pii.retirementDate)}</p>
              )}
            </Section>
          ) : (
            <Locked title="Personal & statutory" what="National ID, KRA PIN, NSSF, SHA, date of birth or bank details" />
          )}
        </div>

        <div className="space-y-6">
          {e.pay ? (
            <Section title="Pay" edit={editHref("pay")}>
              <p className="text-2xl font-semibold">{kes(e.pay.basicSalary)}<span className="text-sm font-normal text-stone-500"> / month basic</span></p>
              <p className="mt-1 text-sm text-stone-500">{e.gradeLabel}</p>
            </Section>
          ) : (
            <Locked title="Pay" what="salary" />
          )}

          <Section title="Career history">
            <ol className="relative space-y-5 border-l border-stone-200 pl-6">
              {history.map((h) => {
                const Icon = EVENT_ICONS[h.type as keyof typeof EVENT_ICONS] ?? Briefcase;
                const pay = h.from?.basicSalary != null && h.to?.basicSalary != null ? `${kes(h.from.basicSalary)} → ${kes(h.to.basicSalary)}` : h.to?.basicSalary != null && h.type === "hire" ? `Starting pay ${kes(h.to.basicSalary)}` : null;
                const grade = h.from?.grade && h.to?.grade && h.from.grade !== h.to.grade ? `${gradeLabel(h.from.grade)} → ${gradeLabel(h.to.grade)}` : null;
                return (
                  <li key={h.id} className="relative">
                    <span className="absolute top-0 -left-[37px] flex size-6 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-4 ring-white">
                      <Icon className="size-3.5" />
                    </span>
                    <p className="text-sm font-medium">{h.summary}</p>
                    {(grade || pay) && <p className="text-xs text-stone-600">{[grade, pay].filter(Boolean).join(" · ")}</p>}
                    <p className="text-xs text-stone-500">{fmtDate(h.effectiveDate)} · recorded by {h.actorName}</p>
                  </li>
                );
              })}
              {!history.length && <li className="text-sm text-stone-500">No history recorded.</li>}
            </ol>
          </Section>
        </div>
      </div>
    </>
  );
}
