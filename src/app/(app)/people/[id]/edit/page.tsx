import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { load } from "@/server/page";
import { getEmployeeForEdit, listDepartments, managerOptions } from "@/server/services/employees";
import { GRADES } from "@/lib/grades";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { kes } from "@/components/people";
import { updateEmployeeAction } from "../../actions";
import { ContactFields, DirectoryFields, FormSection, Input, PiiFields } from "../../fields";

export const metadata: Metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const { view: e, managerId, pii, canEditPay } = await load(getEmployeeForEdit(ctx, id));
  const [departments, managers] = await Promise.all([listDepartments(), managerOptions(ctx)]);
  const grade = GRADES.find((g) => g.code === e.grade);
  const save = (section: "directory" | "contact" | "pii" | "pay") => updateEmployeeAction.bind(null, e.id, section);

  return (
    <>
      <PageHeader
        title={`Edit ${e.fullName}`}
        subtitle="Each section saves on its own. Every change is recorded in the audit trail and, for job changes, in their career history."
        back={{ href: `/people/${e.id}`, label: e.fullName }}
      />
      <div className="max-w-4xl space-y-6">
        <ActionForm action={save("directory")} className="card space-y-5 p-6">
          <FormSection id="directory" title="Employment" subtitle={`Grade ${e.gradeLabel}. Grade changes go through a promotion or demotion request so they're approved.`}>
            <DirectoryFields
              d={{
                firstName: e.firstName, lastName: e.lastName, otherNames: e.otherNames, gender: e.gender, workEmail: e.workEmail,
                jobTitle: e.jobTitle, departmentId: e.departmentId, managerId, employmentType: e.employmentType, status: e.status,
              }}
              departments={departments.map((d) => ({ value: d.id, label: d.name }))}
              managers={managers.filter((m) => m.id !== e.id).map((m) => ({ value: m.id, label: m.label }))}
            />
          </FormSection>
          <div className="flex justify-end"><button className="btn-primary">Save employment</button></div>
        </ActionForm>

        {e.contact && (
          <ActionForm action={save("contact")} className="card space-y-5 p-6">
            <FormSection id="contact" title="Contact">
              <ContactFields
                c={{
                  phone: e.contact.phone,
                  personalEmail: e.contact.personalEmail,
                  address: e.contact.address,
                  town: e.contact.town,
                  county: e.contact.county,
                  kinName: e.contact.nextOfKin?.name ?? "",
                  kinRelationship: e.contact.nextOfKin?.relationship ?? "",
                  kinPhone: e.contact.nextOfKin?.phone ?? "",
                  emergencyName: e.contact.emergencyContact?.name ?? "",
                  emergencyRelationship: e.contact.emergencyContact?.relationship ?? "",
                  emergencyPhone: e.contact.emergencyContact?.phone ?? "",
                }}
              />
            </FormSection>
            <div className="flex justify-end"><button className="btn-primary">Save contact</button></div>
          </ActionForm>
        )}

        {pii && (
          <ActionForm action={save("pii")} className="card space-y-5 p-6">
            <FormSection id="pii" title="Personal & statutory" subtitle="Opening this form was logged in the audit trail, because it shows the full values.">
              <PiiFields p={pii} />
            </FormSection>
            <div className="flex justify-end"><button className="btn-primary">Save personal details</button></div>
          </ActionForm>
        )}

        {canEditPay && e.pay && (
          <ActionForm action={save("pay")} className="card space-y-5 p-6">
            <FormSection
              id="pay"
              title="Pay"
              subtitle={grade ? `${grade.code} band: ${kes(grade.min)} – ${kes(grade.max)}. Outside the band needs a promotion or demotion.` : undefined}
            >
              <Input name="basicSalary" label="Basic salary (KES / month)" type="number" defaultValue={e.pay.basicSalary} required />
              <Input name="reason" label="Reason" required placeholder="e.g. 2027 annual increment" />
            </FormSection>
            <div className="flex justify-end"><button className="btn-primary">Save pay</button></div>
          </ActionForm>
        )}
      </div>
    </>
  );
}
