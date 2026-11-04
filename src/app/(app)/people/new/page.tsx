import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { requirePermission } from "@/server/page";
import { listDepartments, managerOptions } from "@/server/services/employees";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { createEmployeeAction } from "../actions";
import { ContactFields, DirectoryFields, FormSection, GradeSelect, Input, PiiFields } from "../fields";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "employee:create");
  const [departments, managers] = await Promise.all([listDepartments(), managerOptions(ctx)]);
  const canSetPay = has(ctx, "employee.pay:update");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Add employee" subtitle="The staff number is assigned for you." back={{ href: "/people", label: "People" }} />
      <ActionForm action={createEmployeeAction} className="card max-w-4xl space-y-8 p-6">
        <FormSection title="Employment">
          <DirectoryFields isNew departments={departments.map((d) => ({ value: d.id, label: d.name }))} managers={managers.map((m) => ({ value: m.id, label: m.label }))} />
          <GradeSelect />
          <Input name="hireDate" label="Start date" type="date" defaultValue={today} required />
          {canSetPay ? (
            <Input name="basicSalary" label="Basic salary (KES / month)" type="number" hint="Leave blank to use the grade's starting pay." />
          ) : (
            <p className="flex items-start gap-2 self-end text-sm text-stone-500">
              <Lock className="mt-0.5 size-4 shrink-0" /> Starts on the grade&apos;s starting pay.
            </p>
          )}
        </FormSection>

        <FormSection title="Contact">
          <ContactFields />
        </FormSection>

        <FormSection title="Personal & statutory" subtitle="Stored encrypted.">
          <PiiFields />
        </FormSection>

        <div className="flex justify-end border-t border-stone-100 pt-5">
          <button className="btn-primary">Add employee</button>
        </div>
      </ActionForm>
    </>
  );
}
