import { Types, type ClientSession } from "mongoose";
import { z } from "zod";
import { connectDB, withTransaction } from "@/lib/db";
import { blindIndex, encrypt } from "@/lib/crypto";
import { GRADES, RETIREMENT_AGE } from "@/lib/grades";
import { Employee, type EmployeeRecord } from "../models/Employee";
import { Department } from "../models/Department";
import { EmploymentEvent } from "../models/EmploymentEvent";
import { AuditLog } from "../models/AuditLog";
import { nextNumber } from "../models/Counter";
import { authorize, can, has, scopeFilter } from "../authz";
import { diff, record } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { decryptPii, PII_FIELDS, toEmployeeView, type EmployeeView } from "../employeeView";
import type { Ctx } from "../context";

type Stored = EmployeeRecord & { _id: Types.ObjectId };

/**
 * Repeat looks at the same record by the same person within 10 minutes
 * count once, so page refreshes don't bury the audit trail in duplicates.
 * (Explicit reveals with a reason are always logged.)
 */
async function loggedRecently(ctx: Ctx, action: string, entityId: string) {
  return !!(await AuditLog.exists({
    action,
    actorId: ctx.userId,
    entityId,
    at: { $gt: new Date(Date.now() - 10 * 60_000) },
  }));
}

const fullName = (e: Pick<Stored, "firstName" | "lastName">) => `${e.firstName} ${e.lastName}`;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function loadSubject(id: string, session?: ClientSession): Promise<Stored> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Employee");
  const e = await Employee.findById(id).session(session ?? null).lean<Stored>();
  if (!e) throw new NotFoundError("Employee");
  return e;
}

async function departmentNames(): Promise<Map<string, string>> {
  const depts = await Department.find().select("name").lean();
  return new Map(depts.map((d) => [String(d._id), d.name]));
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type DirectoryFilters = { q?: string; departmentId?: string; status?: string };

export async function listEmployees(ctx: Ctx, f: DirectoryFilters = {}) {
  const scope = scopeFilter(ctx, "employee:read");
  if (!scope) throw new ForbiddenError();
  await connectDB();

  const and: Record<string, unknown>[] = [scope];
  if (f.departmentId && Types.ObjectId.isValid(f.departmentId)) and.push({ departmentId: new Types.ObjectId(f.departmentId) });
  if (f.status === "current" || !f.status) and.push({ status: { $ne: "separated" } });
  else if (f.status !== "all") and.push({ status: f.status });

  let byNationalId = false;
  const q = f.q?.trim();
  if (q) {
    // A 7–8 digit search is treated as a National ID: matched through the
    // blind index, so the encrypted values never need decrypting to search.
    const asId = q.replace(/[\s-]/g, "");
    if (/^\d{7,8}$/.test(asId) && has(ctx, "employee.pii:read")) {
      byNationalId = true;
      and.push({ nationalIdHash: blindIndex(asId) });
    } else {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      and.push({ $or: [{ firstName: rx }, { lastName: rx }, { staffNo: rx }, { workEmail: rx }, { jobTitle: rx }] });
    }
  }

  const [rows, depts] = await Promise.all([
    Employee.find({ $and: and }).sort({ firstName: 1, lastName: 1 }).limit(500).lean<Stored[]>(),
    departmentNames(),
  ]);
  // An ID search only counts for people whose PII this user may see.
  const visible = byNationalId ? rows.filter((e) => can(ctx, "employee.pii:read", e)) : rows;
  if (byNationalId) {
    await record(ctx, { action: "employee.pii.search", summary: `Searched employees by National ID (${visible.length} match)` });
  }

  const managerIds = [...new Set(visible.map((e) => String(e.managerId)).filter((x) => x !== "null"))];
  const managers = await Employee.find({ _id: { $in: managerIds } }).select("firstName lastName").lean();
  const managerName = new Map(managers.map((m) => [String(m._id), fullName(m)]));

  return visible.map((e) =>
    toEmployeeView(ctx, e, {
      department: depts.get(String(e.departmentId)),
      manager: e.managerId ? { id: String(e.managerId), name: managerName.get(String(e.managerId)) ?? "" } : null,
    }),
  );
}

export async function getEmployee(ctx: Ctx, id: string) {
  await connectDB();
  const e = await loadSubject(id);
  authorize(ctx, "employee:read", e);

  const [depts, manager, reportsRaw, events] = await Promise.all([
    departmentNames(),
    e.managerId ? Employee.findById(e.managerId).select("firstName lastName managerPath departmentId").lean<Stored>() : null,
    Employee.find({ managerId: e._id, status: { $ne: "separated" } }).sort({ firstName: 1 }).lean<Stored[]>(),
    EmploymentEvent.find({ employeeId: e._id }).sort({ effectiveDate: -1, createdAt: -1 }).lean(),
  ]);

  const view = toEmployeeView(ctx, e, {
    department: depts.get(String(e.departmentId)),
    manager: manager ? { id: String(manager._id), name: fullName(manager) } : null,
  });
  const managerVisible = !!manager && can(ctx, "employee:read", manager);
  const reports = reportsRaw
    .filter((r) => can(ctx, "employee:read", r))
    .map((r) => ({ id: String(r._id), name: fullName(r), jobTitle: r.jobTitle }));

  const history = events.map((ev) => ({
    id: String(ev._id),
    type: ev.type,
    effectiveDate: ev.effectiveDate,
    summary: ev.summary,
    actorName: ev.actorName,
    from: ev.from ? { ...ev.from, basicSalary: view.access.pay ? ev.from.basicSalary : undefined } : null,
    to: ev.to ? { ...ev.to, basicSalary: view.access.pay ? ev.to.basicSalary : undefined } : null,
  }));

  // "Who looked at whose record" is part of the spec. Your own profile isn't logged.
  if (!view.access.own && !(await loggedRecently(ctx, "employee.view", id))) {
    const sections = ["directory", view.access.contact && "contact", view.access.pii && "PII (masked)", view.access.pay && "pay"].filter(Boolean);
    await record(ctx, {
      action: "employee.view",
      entity: "employee",
      entityId: id,
      summary: `Viewed ${view.fullName}'s profile (${sections.join(", ")})`,
    });
  }

  const current = e.status !== "separated";
  const actions = {
    promote: current && !view.access.own && can(ctx, "promotion:initiate", e),
    separate: current && !view.access.own && can(ctx, "separation:initiate", e),
    resign: current && view.access.own && can(ctx, "separation:initiate", e),
  };
  return { view, managerVisible, reports, history, actions };
}

const RevealInput = z.object({
  reason: z.string().trim().max(200).default(""),
});

/**
 * Full PII values, unmasked. Needs employee.pii:read on this person AND a
 * stated reason (except on your own record), and every reveal is audited.
 */
export async function revealPii(ctx: Ctx, id: string, input: unknown) {
  await connectDB();
  const e = await loadSubject(id);
  authorize(ctx, "employee.pii:read", e);
  const own = ctx.employee?.id === id;
  const { reason } = RevealInput.parse(input);
  if (!own && reason.length < 5) throw new AppError("Say why you need to see these details (at least 5 characters).");

  await record(ctx, {
    action: "employee.pii.reveal",
    entity: "employee",
    entityId: id,
    summary: own ? "Viewed own personal details" : `Revealed ${fullName(e)}'s personal and statutory details`,
    reason: own ? undefined : reason,
  });
  return decryptPii(e.pii);
}

/**
 * Data for the edit page. Prefilling the PII form shows the real values, so
 * it counts as a reveal and is audited like one.
 */
export async function getEmployeeForEdit(ctx: Ctx, id: string) {
  await connectDB();
  const e = await loadSubject(id);
  authorize(ctx, "employee:update", e);
  if (e.status === "separated") throw new AppError("This person has left. Their record is read-only.");
  const depts = await departmentNames();
  const view = toEmployeeView(ctx, e, { department: depts.get(String(e.departmentId)) });
  const pii = view.access.pii ? decryptPii(e.pii) : null;
  if (pii && !view.access.own && !(await loggedRecently(ctx, "employee.pii.edit_view", id))) {
    await record(ctx, {
      action: "employee.pii.edit_view",
      entity: "employee",
      entityId: id,
      summary: `Opened ${view.fullName}'s personal details for editing`,
      reason: "Edit form",
    });
  }
  return {
    view,
    managerId: e.managerId ? String(e.managerId) : "",
    pii,
    canEditPay: view.access.pay && has(ctx, "employee.pay:update") && !view.access.own,
  };
}

// ---------------------------------------------------------------------------
// Validation (Kenyan formats)
// ---------------------------------------------------------------------------

const objectId = z.string().refine((s) => Types.ObjectId.isValid(s), "Pick one from the list.");
const optionalId = z.string().optional().transform((s) => (s && Types.ObjectId.isValid(s) ? s : undefined));
const optionalText = (max = 200) => z.string().trim().max(max).optional().default("");
const date = (msg: string) => z.string().min(1, msg).pipe(z.coerce.date({ message: msg }));

/** ID-style numbers: people type them with spaces or dashes ("1234 5678", "A012-345678Z"); store them without. */
const compact = (re: RegExp, msg: string) =>
  z.string().transform((v) => v.replace(/[\s-]/g, "").toUpperCase()).pipe(z.string().regex(re, msg));

const kenyanPhone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => s === "" || /^(?:\+254|254|0)[17]\d{8}$/.test(s), "Use a Kenyan number, e.g. 0712 345 678.")
  .transform((s) => (s ? s.replace(/^(?:\+254|254)/, "0").replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3") : ""));

const DirectoryInput = z.object({
  firstName: z.string().trim().min(1, "Required.").max(60),
  lastName: z.string().trim().min(1, "Required.").max(60),
  otherNames: optionalText(60),
  gender: z.enum(["female", "male"], { message: "Choose one." }),
  workEmail: z.email("Enter a valid email.").transform((s) => s.toLowerCase().trim()),
  jobTitle: z.string().trim().min(2, "Required.").max(100),
  departmentId: objectId,
  managerId: optionalId,
  employmentType: z.enum(["permanent", "contract", "intern"]),
  status: z.enum(["probation", "active", "on_leave"]),
});

const ContactInput = z.object({
  personalEmail: z.union([z.literal(""), z.email("Enter a valid email.")]).default(""),
  phone: kenyanPhone,
  address: optionalText(200),
  town: optionalText(60),
  county: optionalText(60),
  kinName: optionalText(100),
  kinRelationship: optionalText(40),
  kinPhone: kenyanPhone.optional().default(""),
  emergencyName: optionalText(100),
  emergencyRelationship: optionalText(40),
  emergencyPhone: kenyanPhone.optional().default(""),
});

const PiiInput = z.object({
  nationalId: compact(/^\d{7,8}$/, "A Kenyan National ID is 7 or 8 digits."),
  kraPin: compact(/^[AP]\d{9}[A-Z]$/, "A KRA PIN looks like A012345678Z."),
  nssfNo: compact(/^(\d{6,12})?$/, "An NSSF number is 6–12 digits."),
  shaNo: optionalText(20),
  dateOfBirth: date("Enter the date of birth.").refine((d) => ageOn(d, new Date()) >= 18, "Employees must be at least 18."),
  bankName: optionalText(60),
  bankBranch: optionalText(60),
  bankAccount: compact(/^(\d{6,16})?$/, "Account numbers are 6–16 digits."),
});

const gradeCodes = GRADES.map((g) => g.code) as [string, ...string[]];

const CreateInput = DirectoryInput.extend({
  grade: z.enum(gradeCodes, { message: "Choose a grade." }),
  hireDate: date("Enter the start date."),
  basicSalary: z.coerce.number().int().min(0).optional(),
})
  .and(ContactInput)
  .and(PiiInput);

function ageOn(dob: Date, on: Date) {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

function retirementDate(dob: Date) {
  const d = new Date(dob);
  d.setFullYear(d.getFullYear() + RETIREMENT_AGE);
  return d;
}

function contactDoc(c: z.infer<typeof ContactInput>) {
  return {
    personalEmail: c.personalEmail,
    phone: c.phone,
    address: c.address,
    town: c.town,
    county: c.county,
    nextOfKin: { name: c.kinName, relationship: c.kinRelationship, phone: c.kinPhone },
    emergencyContact: { name: c.emergencyName, relationship: c.emergencyRelationship, phone: c.emergencyPhone },
  };
}

function encryptPii(p: z.infer<typeof PiiInput>) {
  const iso = p.dateOfBirth.toISOString().slice(0, 10);
  const plain: Record<string, string> = { ...p, dateOfBirth: iso } as unknown as Record<string, string>;
  const out: Record<string, string> = {};
  for (const f of PII_FIELDS) out[f] = plain[f] ? encrypt(plain[f]) : "";
  return out;
}

async function assertUniqueNationalId(nationalId: string, exceptId?: string) {
  const clash = await Employee.findOne({ nationalIdHash: blindIndex(nationalId), ...(exceptId && { _id: { $ne: exceptId } }) })
    .select("staffNo")
    .lean();
  if (clash) throw new AppError(`Another employee (${clash.staffNo}) already has this National ID.`);
}

async function assertUniqueEmail(workEmail: string, exceptId?: string) {
  if (await Employee.exists({ workEmail, ...(exceptId && { _id: { $ne: exceptId } }) })) {
    throw new AppError("Another employee already uses that work email.");
  }
}

/** The manager's chain + the manager: the new managerPath. Refuses loops (managing your own boss). */
async function pathUnder(managerId: string | undefined, selfId: string | null, session?: ClientSession) {
  if (!managerId) return { managerId: null, managerPath: [] as Types.ObjectId[], managerName: "(none)" };
  if (managerId === selfId) throw new AppError("Someone can't be their own manager.");
  const m = await Employee.findById(managerId).select("firstName lastName managerPath status").session(session ?? null).lean<Stored>();
  if (!m || m.status === "separated") throw new AppError("Pick a current employee as manager.");
  if (selfId && m.managerPath.some((x) => String(x) === selfId)) {
    throw new AppError(`${fullName(m)} reports to this person, so they can't also be their manager.`);
  }
  return { managerId: m._id, managerPath: [...m.managerPath, m._id], managerName: fullName(m) };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * `opts.approvedSalary`: hiring from an accepted offer. The salary was
 * already set by someone with recruitment rights and accepted by the
 * candidate, so whoever onboards them doesn't need pay rights to carry it over.
 */
export async function createEmployee(ctx: Ctx, input: unknown, opts: { approvedSalary?: number; source?: string } = {}) {
  authorize(ctx, "employee:create");
  const data = CreateInput.parse(input);
  await connectDB();
  const dept = await Department.findById(data.departmentId).lean();
  if (!dept) throw new AppError("Pick a department.");
  await assertUniqueEmail(data.workEmail);
  await assertUniqueNationalId(data.nationalId);

  // Setting a salary needs pay rights. Without them the grade's starting salary is used.
  const grade = GRADES.find((g) => g.code === data.grade)!;
  if (data.basicSalary !== undefined && !has(ctx, "employee.pay:update")) {
    throw new ForbiddenError("You can't set salaries. Leave it blank and HR will use the grade's starting pay.");
  }
  const basicSalary = opts.approvedSalary ?? data.basicSalary ?? grade.min;

  const created = await withTransaction(async (session) => {
    const mgr = await pathUnder(data.managerId, null, session);
    const staffNo = `KG-${await nextNumber("staffNo", session)}`;
    const [e] = await Employee.create(
      [
        {
          staffNo,
          firstName: data.firstName,
          lastName: data.lastName,
          otherNames: data.otherNames,
          gender: data.gender,
          workEmail: data.workEmail,
          jobTitle: data.jobTitle,
          grade: data.grade,
          departmentId: data.departmentId,
          managerId: mgr.managerId,
          managerPath: mgr.managerPath,
          employmentType: data.employmentType,
          status: data.status === "on_leave" ? "active" : data.status,
          hireDate: data.hireDate,
          retirementDate: retirementDate(data.dateOfBirth),
          contact: contactDoc(data),
          pii: encryptPii(data),
          nationalIdHash: blindIndex(data.nationalId),
          pay: { basicSalary, currency: "KES" },
        },
      ],
      { session },
    );
    await EmploymentEvent.create(
      [
        {
          employeeId: e._id,
          type: "hire",
          effectiveDate: data.hireDate,
          summary: `Joined ${dept.name} as ${data.jobTitle}${opts.source ? `, hired through ${opts.source}` : ""}`,
          to: { jobTitle: data.jobTitle, grade: data.grade, departmentId: dept._id, departmentName: dept.name, managerName: mgr.managerName, basicSalary },
          actorName: ctx.name,
        },
      ],
      { session },
    );
    return e;
  });

  await record(ctx, {
    action: "employee.create",
    entity: "employee",
    entityId: String(created._id),
    summary: `Added employee ${data.firstName} ${data.lastName} (${created.staffNo}), ${data.jobTitle}, ${dept.name}`,
    changes: [{ field: "PII", to: "[redacted] national ID, KRA PIN, NSSF, SHA, date of birth, bank" }],
  });
  return String(created._id);
}

/** Who may edit what: the general edit right, plus the right to see that class of data. */
async function loadForEdit(ctx: Ctx, id: string, needs?: "employee.contact:read" | "employee.pii:read") {
  await connectDB();
  const e = await loadSubject(id);
  authorize(ctx, "employee:update", e);
  if (needs) authorize(ctx, needs, e);
  if (e.status === "separated") throw new AppError("This person has left. Their record is read-only.");
  return e;
}

export async function updateDirectory(ctx: Ctx, id: string, input: unknown) {
  const data = DirectoryInput.parse(input);
  const e = await loadForEdit(ctx, id);
  await assertUniqueEmail(data.workEmail, id);
  const depts = await departmentNames();
  if (!depts.has(data.departmentId)) throw new AppError("Pick a department.");

  const before = {
    ...e,
    departmentId: depts.get(String(e.departmentId)),
    managerId: e.managerId ? String(e.managerId) : "",
  } as Record<string, unknown>;

  await withTransaction(async (session) => {
    const managerChanged = String(e.managerId ?? "") !== (data.managerId ?? "");
    const deptChanged = String(e.departmentId) !== data.departmentId;
    const mgr = managerChanged ? await pathUnder(data.managerId, id, session) : null;
    const oldManagerName = e.managerId
      ? (await Employee.findById(e.managerId).select("firstName lastName").session(session).lean<Stored>().then((m) => (m ? fullName(m) : "")))
      : "(none)";

    await Employee.updateOne(
      { _id: id },
      {
        firstName: data.firstName,
        lastName: data.lastName,
        otherNames: data.otherNames,
        gender: data.gender,
        workEmail: data.workEmail,
        jobTitle: data.jobTitle,
        departmentId: data.departmentId,
        employmentType: data.employmentType,
        status: data.status,
        ...(mgr && { managerId: mgr.managerId, managerPath: mgr.managerPath }),
      },
      { session },
    );

    // Everyone under this person inherits the new chain above them.
    if (mgr) {
      const subtree = await Employee.find({ managerPath: e._id }).select("managerPath").session(session).lean<Stored[]>();
      if (subtree.length) {
        await Employee.bulkWrite(
          subtree.map((d) => {
            const i = d.managerPath.findIndex((x) => String(x) === id);
            return {
              updateOne: {
                filter: { _id: d._id },
                update: { managerPath: [...mgr.managerPath, e._id, ...d.managerPath.slice(i + 1)] },
              },
            };
          }),
          { session },
        );
      }
    }

    const events = [];
    if (deptChanged) {
      events.push({
        employeeId: e._id,
        type: "transfer" as const,
        effectiveDate: new Date(),
        summary: `Moved from ${depts.get(String(e.departmentId))} to ${depts.get(data.departmentId)}`,
        from: { departmentId: e.departmentId, departmentName: depts.get(String(e.departmentId)) },
        to: { departmentId: new Types.ObjectId(data.departmentId), departmentName: depts.get(data.departmentId) },
        actorName: ctx.name,
      });
    }
    if (mgr) {
      events.push({
        employeeId: e._id,
        type: "manager_change" as const,
        effectiveDate: new Date(),
        summary: `Now reports to ${mgr.managerName}`,
        from: { managerName: oldManagerName },
        to: { managerName: mgr.managerName },
        actorName: ctx.name,
      });
    }
    if (e.status !== data.status) {
      events.push({
        employeeId: e._id,
        type: "status_change" as const,
        effectiveDate: new Date(),
        summary: e.status === "probation" && data.status === "active" ? "Confirmed after probation" : `Status changed to ${data.status.replace("_", " ")}`,
        from: { status: e.status },
        to: { status: data.status },
        actorName: ctx.name,
      });
    }
    if (events.length) await EmploymentEvent.create(events, { session, ordered: true });
  });

  const after = { ...data, departmentId: depts.get(data.departmentId), managerId: data.managerId ?? "" };
  const changes = diff(before, after, ["firstName", "lastName", "otherNames", "gender", "workEmail", "jobTitle", "departmentId", "managerId", "employmentType", "status"]);
  if (changes.length) {
    await record(ctx, {
      action: "employee.update",
      entity: "employee",
      entityId: id,
      summary: `Updated ${data.firstName} ${data.lastName}'s employment details`,
      changes: changes.map((c) => (c.field === "managerId" ? { field: "manager", from: "(changed)", to: "(see history)" } : c)),
    });
  }
}

export async function updateContact(ctx: Ctx, id: string, input: unknown) {
  const data = ContactInput.parse(input);
  const e = await loadForEdit(ctx, id, "employee.contact:read");
  const next = contactDoc(data);
  await Employee.updateOne({ _id: id }, { contact: next });

  const flat = (c: ReturnType<typeof contactDoc> | Stored["contact"]) => ({
    personalEmail: c?.personalEmail, phone: c?.phone, address: c?.address, town: c?.town, county: c?.county,
    nextOfKin: JSON.stringify(c?.nextOfKin ?? {}), emergencyContact: JSON.stringify(c?.emergencyContact ?? {}),
  });
  const fields = ["personalEmail", "phone", "address", "town", "county", "nextOfKin", "emergencyContact"];
  // Contact details are personal data too: the log names the fields, not the values.
  const changes = diff(flat(e.contact), flat(next), fields, new Set(fields));
  if (changes.length) {
    await record(ctx, {
      action: "employee.contact.update",
      entity: "employee",
      entityId: id,
      summary: `Updated ${fullName(e)}'s contact details`,
      changes,
    });
  }
}

export async function updatePii(ctx: Ctx, id: string, input: unknown) {
  const data = PiiInput.parse(input);
  const e = await loadForEdit(ctx, id, "employee.pii:read");
  await assertUniqueNationalId(data.nationalId, id);

  const old = decryptPii(e.pii);
  const nextPlain = { ...data, dateOfBirth: data.dateOfBirth.toISOString().slice(0, 10) } as Record<string, string>;
  await Employee.updateOne(
    { _id: id },
    {
      pii: encryptPii(data),
      nationalIdHash: blindIndex(data.nationalId),
      retirementDate: retirementDate(data.dateOfBirth),
    },
  );
  const changes = diff(old, nextPlain, [...PII_FIELDS], new Set(PII_FIELDS));
  if (changes.length) {
    await record(ctx, {
      action: "employee.pii.update",
      entity: "employee",
      entityId: id,
      summary: `Updated ${fullName(e)}'s personal and statutory details`,
      changes,
    });
  }
}

const PayInput = z.object({
  basicSalary: z.coerce.number({ message: "Enter an amount." }).int().min(1, "Enter an amount."),
  reason: z.string().trim().min(5, "Say why (e.g. annual increment)."),
});

/** Pay changes outside a promotion (e.g. annual increment). Promotions change pay through their own approval (M4). */
export async function updatePay(ctx: Ctx, id: string, input: unknown) {
  authorize(ctx, "employee.pay:update");
  const data = PayInput.parse(input);
  const e = await loadForEdit(ctx, id);
  authorize(ctx, "employee.pay:read", e);
  if (ctx.employee?.id === id) throw new AppError("You can't change your own salary.");
  const grade = GRADES.find((g) => g.code === e.grade);
  if (grade && (data.basicSalary < grade.min || data.basicSalary > grade.max)) {
    throw new AppError(
      `KES ${data.basicSalary.toLocaleString()} is outside the ${grade.code} band (KES ${grade.min.toLocaleString()}–${grade.max.toLocaleString()}). Change the grade through a promotion instead.`,
    );
  }
  const before = e.pay?.basicSalary ?? 0;
  if (before === data.basicSalary) return;

  await withTransaction(async (session) => {
    await Employee.updateOne({ _id: id }, { "pay.basicSalary": data.basicSalary }, { session });
    await EmploymentEvent.create(
      [
        {
          employeeId: e._id,
          type: "salary_change",
          effectiveDate: new Date(),
          summary: `Salary ${data.basicSalary > before ? "increased" : "reduced"}: ${data.reason}`,
          from: { basicSalary: before },
          to: { basicSalary: data.basicSalary },
          actorName: ctx.name,
        },
      ],
      { session },
    );
  });
  await record(ctx, {
    action: "employee.pay.update",
    entity: "employee",
    entityId: id,
    summary: `Changed ${fullName(e)}'s salary`,
    reason: data.reason,
    changes: [{ field: "basicSalary", from: "[redacted]", to: "[redacted]" }],
  });
}

// ---------------------------------------------------------------------------
// Lookups for forms and the org chart
// ---------------------------------------------------------------------------

export async function listDepartments() {
  await connectDB();
  const depts = await Department.find().sort({ name: 1 }).lean();
  return depts.map((d) => ({ id: String(d._id), name: d.name, code: d.code }));
}

/** Current employees this person may act on with `perm` (e.g. whom a manager may propose for promotion), excluding themselves. */
export async function employeesWithin(ctx: Ctx, perm: "promotion:initiate" | "separation:initiate") {
  const scope = scopeFilter(ctx, perm);
  if (!scope) return [];
  await connectDB();
  const people = await Employee.find({ $and: [scope, { status: { $ne: "separated" } }] })
    .select("firstName lastName jobTitle grade")
    .sort({ firstName: 1 })
    .lean();
  return people
    .filter((p) => String(p._id) !== ctx.employee?.id)
    .map((p) => ({ id: String(p._id), label: `${fullName(p)} · ${p.jobTitle} (${p.grade})`, jobTitle: p.jobTitle, grade: p.grade }));
}

/** Everyone who could be picked as a manager (current employees). */
export async function managerOptions(ctx: Ctx) {
  if (!has(ctx, "employee:create") && !has(ctx, "employee:update")) throw new ForbiddenError();
  await connectDB();
  const people = await Employee.find({ status: { $ne: "separated" } }).select("firstName lastName jobTitle").sort({ firstName: 1 }).lean();
  return people.map((p) => ({ id: String(p._id), label: `${fullName(p)} · ${p.jobTitle}` }));
}

export type OrgNode = { id: string; name: string; jobTitle: string; department: string; status: string; children: OrgNode[] };

/**
 * The reporting tree, limited to who this person may see. If someone's
 * manager is outside their view, that person becomes a top-level node.
 */
export async function orgChart(ctx: Ctx): Promise<OrgNode[]> {
  const scope = scopeFilter(ctx, "employee:read");
  if (!scope) throw new ForbiddenError();
  await connectDB();
  const [rows, depts] = await Promise.all([
    Employee.find({ $and: [scope, { status: { $ne: "separated" } }] }).sort({ firstName: 1 }).lean<Stored[]>(),
    departmentNames(),
  ]);
  const nodes = new Map<string, OrgNode>(
    rows.map((e) => [
      String(e._id),
      { id: String(e._id), name: fullName(e), jobTitle: e.jobTitle, department: depts.get(String(e.departmentId)) ?? "", status: e.status, children: [] },
    ]),
  );
  const roots: OrgNode[] = [];
  for (const e of rows) {
    const node = nodes.get(String(e._id))!;
    const parent = e.managerId ? nodes.get(String(e.managerId)) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export type { EmployeeView };
