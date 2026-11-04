import { decrypt, mask } from "@/lib/crypto";
import { gradeLabel } from "@/lib/grades";
import type { EmployeeRecord } from "./models/Employee";
import { can } from "./authz";
import type { Ctx } from "./context";

/**
 * THE way an employee record leaves the server. Every page, list and export
 * goes through toEmployeeView(), which keeps only the field classes this
 * person may see (docs/DESIGN.md §4):
 *
 *   directory  employee:read           always (else they'd never get here)
 *   contact    employee.contact:read   phone, address, next of kin
 *   pii        employee.pii:read       MASKED here; full values only via revealPii(), with a reason
 *   pay        employee.pay:read       salary
 *
 * A field you may not see isn't hidden in the browser: it's never sent.
 */

export const PII_FIELDS = ["nationalId", "kraPin", "nssfNo", "shaNo", "dateOfBirth", "bankName", "bankBranch", "bankAccount"] as const;
export type PiiField = (typeof PII_FIELDS)[number];

export const PII_LABELS: Record<PiiField, string> = {
  nationalId: "National ID",
  kraPin: "KRA PIN",
  nssfNo: "NSSF no.",
  shaNo: "SHA no.",
  dateOfBirth: "Date of birth",
  bankName: "Bank",
  bankBranch: "Branch",
  bankAccount: "Account no.",
};

type Stored = EmployeeRecord & { _id: unknown };

export type EmployeeAccess = {
  own: boolean;
  contact: boolean;
  pii: boolean;
  pay: boolean;
  edit: boolean;
};

export function accessTo(ctx: Ctx, e: Stored): EmployeeAccess {
  return {
    own: ctx.employee?.id === String(e._id),
    contact: can(ctx, "employee.contact:read", e),
    pii: can(ctx, "employee.pii:read", e),
    pay: can(ctx, "employee.pay:read", e),
    edit: can(ctx, "employee:update", e),
  };
}

/** Bank and branch aren't identifiers on their own, so they stay readable. */
const READABLE = new Set<PiiField>(["bankName", "bankBranch"]);

/** Decrypt, then show only the last few characters. */
function maskedPii(pii: Stored["pii"]) {
  const out = {} as Record<PiiField, string>;
  for (const f of PII_FIELDS) {
    const raw = pii?.[f] ? decrypt(pii[f]!) : "";
    out[f] = !raw ? "" : READABLE.has(f) ? raw : f === "dateOfBirth" ? "••••-••-••" : mask(raw, f === "bankAccount" ? 4 : 3);
  }
  return out;
}

export function decryptPii(pii: Stored["pii"]) {
  const out = {} as Record<PiiField, string>;
  for (const f of PII_FIELDS) out[f] = pii?.[f] ? decrypt(pii[f]!) : "";
  return out;
}

export function toEmployeeView(
  ctx: Ctx,
  e: Stored,
  names: { department?: string; manager?: { id: string; name: string } | null } = {},
) {
  const access = accessTo(ctx, e);
  return {
    id: String(e._id),
    staffNo: e.staffNo,
    firstName: e.firstName,
    lastName: e.lastName,
    otherNames: e.otherNames,
    fullName: [e.firstName, e.otherNames, e.lastName].filter(Boolean).join(" "),
    gender: e.gender,
    workEmail: e.workEmail,
    jobTitle: e.jobTitle,
    grade: e.grade,
    gradeLabel: gradeLabel(e.grade),
    departmentId: String(e.departmentId),
    departmentName: names.department ?? "",
    manager: names.manager ?? null,
    employmentType: e.employmentType,
    status: e.status,
    hireDate: e.hireDate,
    separationDate: e.separationDate,
    access,
    contact: access.contact
      ? {
          personalEmail: e.contact?.personalEmail ?? "",
          phone: e.contact?.phone ?? "",
          address: e.contact?.address ?? "",
          town: e.contact?.town ?? "",
          county: e.contact?.county ?? "",
          nextOfKin: e.contact?.nextOfKin ?? null,
          emergencyContact: e.contact?.emergencyContact ?? null,
        }
      : null,
    // Retirement date gives away the year of birth, so it sits with PII.
    pii: access.pii ? { ...maskedPii(e.pii), retirementDate: e.retirementDate } : null,
    pay: access.pay ? { basicSalary: e.pay?.basicSalary ?? 0, currency: e.pay?.currency ?? "KES" } : null,
  };
}

export type EmployeeView = ReturnType<typeof toEmployeeView>;
