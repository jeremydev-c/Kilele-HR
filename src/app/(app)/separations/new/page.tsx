import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { can } from "@/server/authz";
import { requirePermission } from "@/server/page";
import { employeesWithin } from "@/server/services/employees";
import { KIND_LABELS, NOTICE_DAYS } from "@/server/services/separations";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { Input, Select } from "../../people/fields";
import { startSeparationAction } from "../actions";

export const metadata: Metadata = { title: "Start an exit" };

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export default async function NewSeparationPage({ searchParams }: { searchParams: Promise<{ employee?: string; kind?: string; self?: string }> }) {
  const ctx = await requireCtx();
  await requirePermission(ctx, "separation:initiate");
  const sp = await searchParams;
  const self = sp.self === "1" && !!ctx.employee;
  const people = self ? [] : await employeesWithin(ctx, "separation:initiate");
  const canResign = !!ctx.employee && can(ctx, "separation:initiate", { _id: ctx.employee.id, departmentId: ctx.employee.departmentId, managerPath: ctx.employee.managerPath });

  return (
    <>
      <PageHeader
        title={self ? "Resign" : "Start an exit"}
        subtitle={`Needs manager and HR approval. Notice is usually ${NOTICE_DAYS} days.`}
        back={{ href: "/separations", label: "Exits" }}
      />
      <ActionForm action={startSeparationAction} className="card max-w-3xl space-y-5 p-6">
        {self ? (
          <>
            <input type="hidden" name="employeeId" value={ctx.employee!.id} />
            <input type="hidden" name="kind" value="resignation" />
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select name="employeeId" label="Who" required empty="Choose…" defaultValue={sp.employee} options={people.map((p) => ({ value: p.id, label: p.label }))} />
            <Select
              name="kind"
              label="Kind of exit"
              defaultValue={sp.kind ?? "resignation"}
              options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
        )}
        <Input name="lastDay" label="Last working day" type="date" required defaultValue={inDays(NOTICE_DAYS)} />
        <div>
          <label className="label" htmlFor="reason">{self ? "Anything you'd like to tell us (required)" : "Reason"}</label>
          <textarea id="reason" name="reason" rows={4} required className="input" placeholder={self ? "e.g. I'm moving to Kisumu to be closer to family." : "Terminations need a full, factual reason."} />
          <FieldError name="reason" />
        </div>
        <div className="flex justify-end"><button className="btn-primary">{self ? "Submit my resignation" : "Send for approval"}</button></div>
        {!self && canResign && <p className="text-xs text-stone-500">Leaving yourself? Use “Resign” on your own profile.</p>}
      </ActionForm>
    </>
  );
}
