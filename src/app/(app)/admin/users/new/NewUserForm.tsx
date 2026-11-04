"use client";

import { useState } from "react";
import { ActionForm, FieldError } from "@/components/ActionForm";
import { createUserAction } from "../actions";

type Employee = { id: string; label: string; name: string; email: string };
type Role = { id: string; name: string; description: string; assignable: boolean };

export function NewUserForm({ employees, roles }: { employees: Employee[]; roles: Role[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <ActionForm action={createUserAction} className="card max-w-2xl space-y-5 p-6">
      <div>
        <label className="label" htmlFor="employeeId">Employee</label>
        <select
          id="employeeId"
          name="employeeId"
          className="input"
          defaultValue=""
          onChange={(e) => {
            const emp = employees.find((x) => x.id === e.target.value);
            if (emp) {
              setName(emp.name);
              setEmail(emp.email);
            }
          }}
        >
          <option value="">Not an employee (e.g. external auditor)</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <p className="mt-1 text-xs text-stone-500">
          Linking the account to an employee is what makes “own”, “team” and “department” permissions work.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          <FieldError name="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
          <FieldError name="email" />
        </div>
      </div>

      <fieldset>
        <legend className="label">Roles</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map((r) => (
            <label
              key={r.id}
              className={`flex gap-3 rounded-lg border p-3 text-sm ${r.assignable ? "border-stone-200 hover:bg-stone-50" : "border-stone-100 opacity-50"}`}
              title={r.assignable ? undefined : "This role has permissions you don't hold, so you can't give it out."}
            >
              <input type="checkbox" name="roleIds" value={r.id} disabled={!r.assignable} className="mt-0.5 accent-brand-600" />
              <span>
                <span className="block font-medium">{r.name}</span>
                <span className="block text-xs text-stone-500">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError name="roleIds" />
      </fieldset>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary">Create account</button>
      </div>
    </ActionForm>
  );
}
