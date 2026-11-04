import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb, X } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { requirePermission } from "@/server/page";
import { listDepartments } from "@/server/services/employees";
import { hiringSuggestions } from "@/server/services/recruitment";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { PageHeader, SectionTitle, fmtDate } from "@/components/ui";
import { GradeSelect, Input, Select } from "../../../people/fields";
import { createRequisitionAction } from "../../actions";

export const metadata: Metadata = { title: "Request a hire" };

export default async function NewRequisitionPage({ searchParams }: { searchParams: Promise<{ replaces?: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "requisition:create");
  const { replaces } = await searchParams;
  const [depts, suggestions] = await Promise.all([listDepartments(), hiringSuggestions(ctx)]);
  const anyDept = has(ctx, "recruitment:manage");
  const options = depts.filter((d) => anyDept || d.id === ctx.employee?.departmentId).map((d) => ({ value: d.id, label: d.name }));
  // Picking a suggestion fills the form in: same job, grade and department, and a ready reason.
  const pick = suggestions.find((s) => s.employeeId === replaces);
  const reason = pick
    ? `Replacement for ${pick.name} (${pick.jobTitle}), ${pick.why === "Turns 60" ? "who retires" : "leaving"} on ${fmtDate(pick.when)}.`
    : "";

  return (
    <>
      <PageHeader
        title="Request a hire"
        subtitle="Needs approval before it can be advertised. You'll be the hiring manager."
        back={{ href: "/recruitment", label: "Hiring" }}
      />

      {suggestions.length > 0 && !pick && (
        <section className="mb-6 max-w-3xl">
          <SectionTitle>Suggested</SectionTitle>
          <ul className="card divide-y divide-stone-100 overflow-hidden">
            {suggestions.map((s) => (
              <li key={s.employeeId} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lightbulb className="size-4" /></span>
                  <span>
                    <span className="block font-medium">Replace {s.name}</span>
                    <span className="block text-sm text-stone-500">{s.jobTitle} · {s.why} {fmtDate(s.when)}</span>
                  </span>
                </span>
                <Link href={`?replaces=${s.employeeId}`} className="btn-secondary">Use</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pick && (
        <p className="mb-4 flex max-w-3xl items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <span>Replacing <b>{pick.name}</b> · {pick.jobTitle}</span>
          <Link href="?" className="text-brand-700 hover:text-brand-900" aria-label="Start blank instead"><X className="size-4" /></Link>
        </p>
      )}

      <ActionForm key={pick?.employeeId ?? "blank"} action={createRequisitionAction} className="card max-w-3xl space-y-5 p-6">
        {pick && <input type="hidden" name="replacesEmployeeId" value={pick.employeeId} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="title" label="Job title" required placeholder="e.g. Senior Frontend Engineer" defaultValue={pick?.jobTitle} />
          <Select name="departmentId" label="Department" required options={options} defaultValue={pick?.departmentId ?? ctx.employee?.departmentId} />
          <GradeSelect defaultValue={pick?.grade} />
          <Select
            name="employmentType"
            label="Type"
            defaultValue="permanent"
            options={[{ value: "permanent", label: "Permanent" }, { value: "contract", label: "Contract" }, { value: "intern", label: "Internship" }]}
          />
          <Input name="openings" label="How many people?" type="number" defaultValue={1} required />
        </div>
        <div>
          <label className="label" htmlFor="justification">Why is this hire needed?</label>
          <textarea id="justification" name="justification" rows={4} required className="input" defaultValue={reason} placeholder="e.g. Two big client projects start in January and the team is at capacity…" />
          <FieldError name="justification" />
        </div>
        <div className="flex justify-end"><button className="btn-primary">Send for approval</button></div>
      </ActionForm>
    </>
  );
}
