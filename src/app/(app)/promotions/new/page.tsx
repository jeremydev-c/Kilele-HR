import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { requirePermission } from "@/server/page";
import { employeesWithin } from "@/server/services/employees";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { GradeSelect, Input, Select } from "../../people/fields";
import { proposeMovementAction } from "../actions";

export const metadata: Metadata = { title: "Propose a promotion" };

/** Career moves usually start on the 1st of a month. */
function firstOfNextMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export default async function ProposePage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "promotion:initiate");
  const { employee } = await searchParams;
  const people = await employeesWithin(ctx, "promotion:initiate");
  const chosen = people.find((p) => p.id === employee);
  const seesPay = has(ctx, "employee.pay:read");
  const in30 = firstOfNextMonth();

  return (
    <>
      <PageHeader
        title="Propose a promotion"
        subtitle="Goes to your manager, then HR. Pick a lower grade for a demotion."
        back={{ href: "/promotions", label: "Promotions" }}
      />
      <ActionForm action={proposeMovementAction} className="card max-w-3xl space-y-5 p-6">
        <Select name="employeeId" label="Who" required empty="Choose…" defaultValue={chosen?.id} options={people.map((p) => ({ value: p.id, label: p.label }))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="jobTitle" label="New job title" required defaultValue={chosen?.jobTitle} />
          <GradeSelect />
          <Input name="effectiveDate" label="Effective from" type="date" required defaultValue={in30} />
          {seesPay ? (
            <Input name="basicSalary" label="New basic salary (optional)" type="number" hint="Blank = moved into the new grade's band automatically." />
          ) : (
            <p className="self-end text-sm text-stone-500">Pay moves into the new grade&apos;s band automatically.</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="justification">Why?</label>
          <textarea id="justification" name="justification" rows={4} required className="input" placeholder="What they've delivered, the scope of the new role…" />
          <FieldError name="justification" />
        </div>
        <div className="flex justify-end"><button className="btn-primary">Send for approval</button></div>
      </ActionForm>
    </>
  );
}
