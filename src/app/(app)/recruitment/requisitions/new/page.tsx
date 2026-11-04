import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { has } from "@/server/authz";
import { requirePermission } from "@/server/page";
import { listDepartments } from "@/server/services/employees";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { GradeSelect, Input, Select } from "../../../people/fields";
import { createRequisitionAction } from "../../actions";

export const metadata: Metadata = { title: "Request a hire" };

export default async function NewRequisitionPage() {
  const ctx = await requireCtx();
  await requirePermission(ctx, "requisition:create");
  const depts = await listDepartments();
  const anyDept = has(ctx, "recruitment:manage");
  const options = depts.filter((d) => anyDept || d.id === ctx.employee?.departmentId).map((d) => ({ value: d.id, label: d.name }));

  return (
    <>
      <PageHeader
        title="Request a hire"
        subtitle="Needs approval before it can be advertised. You'll be the hiring manager."
        back={{ href: "/recruitment", label: "Hiring" }}
      />
      <ActionForm action={createRequisitionAction} className="card max-w-3xl space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="title" label="Job title" required placeholder="e.g. Senior Frontend Engineer" />
          <Select name="departmentId" label="Department" required options={options} defaultValue={ctx.employee?.departmentId} />
          <GradeSelect />
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
          <textarea id="justification" name="justification" rows={4} required className="input" placeholder="e.g. Two big client projects start in January and the team is at capacity…" />
          <FieldError name="justification" />
        </div>
        <div className="flex justify-end"><button className="btn-primary">Send for approval</button></div>
      </ActionForm>
    </>
  );
}
