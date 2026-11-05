import { FieldError } from "@/components/ActionForm";
import { GRADES } from "@/lib/grades";
import { EMPLOYMENT_TYPES, kes } from "@/components/people";

/** Form building blocks shared by "Add employee" and "Edit employee". */

export function Input({
  name, label, defaultValue, type = "text", required, placeholder, hint, className = "", min,
}: {
  name: string; label: string; defaultValue?: string | number; type?: string; required?: boolean; placeholder?: string; hint?: string; className?: string; min?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{label}{required && <span className="text-red-600"> *</span>}</label>
      <input id={name} name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} min={min} className="input" />
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function Select({
  name, label, options, defaultValue, required, empty,
}: {
  name: string; label: string; options: { value: string; label: string }[]; defaultValue?: string; required?: boolean; empty?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}{required && <span className="text-red-600"> *</span>}</label>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} required={required} className="input">
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <FieldError name={name} />
    </div>
  );
}

export function FormSection({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

type Opt = { value: string; label: string };

export function DirectoryFields({
  d, departments, managers, isNew,
}: {
  d?: Partial<Record<string, string>>; departments: Opt[]; managers: Opt[]; isNew?: boolean;
}) {
  return (
    <>
      <Input name="firstName" label="First name" defaultValue={d?.firstName} required />
      <Input name="lastName" label="Last name" defaultValue={d?.lastName} required />
      <Input name="otherNames" label="Other names" defaultValue={d?.otherNames} />
      <Select name="gender" label="Gender" defaultValue={d?.gender} required empty="Choose…" options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} />
      <Input name="workEmail" label="Work email" type="email" defaultValue={d?.workEmail} required placeholder="first.last@kilele.co.ke" />
      <Input name="jobTitle" label="Job title" defaultValue={d?.jobTitle} required />
      <Select name="departmentId" label="Department" defaultValue={d?.departmentId} required empty="Choose…" options={departments} />
      <Select name="managerId" label="Reports to" defaultValue={d?.managerId} empty="No one (top of the organisation)" options={managers} />
      <Select
        name="employmentType"
        label="Employment type"
        defaultValue={d?.employmentType ?? "permanent"}
        options={Object.entries(EMPLOYMENT_TYPES).map(([value, label]) => ({ value, label }))}
      />
      <Select
        name="status"
        label="Status"
        defaultValue={d?.status ?? "probation"}
        options={[
          { value: "probation", label: "Probation" },
          { value: "active", label: "Active (confirmed)" },
          ...(isNew ? [] : [{ value: "on_leave", label: "On leave" }]),
        ]}
      />
    </>
  );
}

export function GradeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <Select
      name="grade"
      label="Job grade"
      required
      defaultValue={defaultValue}
      empty="Choose…"
      options={GRADES.map((g) => ({ value: g.code, label: `${g.code} · ${g.name} (${kes(g.min)}–${g.max.toLocaleString()})` }))}
    />
  );
}

export function ContactFields({ c }: { c?: Partial<Record<string, string>> }) {
  return (
    <>
      <Input name="phone" label="Phone" type="tel" defaultValue={c?.phone} placeholder="0712 345 678" />
      <Input name="personalEmail" label="Personal email" type="email" defaultValue={c?.personalEmail} />
      <Input name="address" label="Address" defaultValue={c?.address} placeholder="Estate / street, P.O. Box" />
      <Input name="town" label="Town" defaultValue={c?.town} />
      <Input name="county" label="County" defaultValue={c?.county} />
      <span className="hidden sm:block" />
      <Input name="kinName" label="Next of kin" defaultValue={c?.kinName} />
      <Input name="kinRelationship" label="Relationship" defaultValue={c?.kinRelationship} placeholder="e.g. Spouse" />
      <Input name="kinPhone" label="Next of kin phone" type="tel" defaultValue={c?.kinPhone} />
      <span className="hidden sm:block" />
      <Input name="emergencyName" label="Emergency contact" defaultValue={c?.emergencyName} />
      <Input name="emergencyRelationship" label="Relationship" defaultValue={c?.emergencyRelationship} />
      <Input name="emergencyPhone" label="Emergency phone" type="tel" defaultValue={c?.emergencyPhone} />
    </>
  );
}

export function PiiFields({ p }: { p?: Partial<Record<string, string>> }) {
  return (
    <>
      <Input name="nationalId" label="National ID" defaultValue={p?.nationalId} required placeholder="12345678" />
      <Input name="kraPin" label="KRA PIN" defaultValue={p?.kraPin} required placeholder="A012345678Z" />
      <Input name="nssfNo" label="NSSF no." defaultValue={p?.nssfNo} />
      <Input name="shaNo" label="SHA no." defaultValue={p?.shaNo} />
      <Input name="dateOfBirth" label="Date of birth" type="date" defaultValue={p?.dateOfBirth} required />
      <span className="hidden sm:block" />
      <Input name="bankName" label="Bank" defaultValue={p?.bankName} placeholder="e.g. Equity Bank" />
      <Input name="bankBranch" label="Branch" defaultValue={p?.bankBranch} />
      <Input name="bankAccount" label="Account no." defaultValue={p?.bankAccount} />
    </>
  );
}
