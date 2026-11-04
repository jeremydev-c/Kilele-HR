/**
 * Demo data for Kilele Group Ltd (a made-up company). WIPES the database first.
 *
 *   npm run seed
 *
 * Every account's password is DEMO_PASSWORD from .env.local.
 * Refuses to run against anything but a local database unless --force.
 */
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { blindIndex, encrypt } from "@/lib/crypto";
import { RETIREMENT_AGE } from "@/lib/grades";
import { User } from "@/server/models/User";
import { Role } from "@/server/models/Role";
import { Department } from "@/server/models/Department";
import { Employee } from "@/server/models/Employee";
import { AuditLog } from "@/server/models/AuditLog";
import { EmploymentEvent } from "@/server/models/EmploymentEvent";
import { Counter } from "@/server/models/Counter";
import { LeaveAdjustment, LeaveRequest, LeaveType, PublicHoliday } from "@/server/models/Leave";
import { record, SYSTEM } from "@/server/audit";
import { ctxForUser } from "@/server/context";
import { EXAMPLE_CUSTOM_ROLES, SYSTEM_ROLES } from "@/server/roles";
import { adjustBalance, applyLeave, cancelLeave } from "@/server/services/leave";
import { decide } from "@/server/services/approvals";
import { Application, Requisition, Vacancy } from "@/server/models/Recruitment";
import {
  candidateRespond, createRequisition, createVacancy, makeOffer, moveStage, scheduleInterview, submitApplication, submitScorecard,
} from "@/server/services/recruitment";
import { writeFileSync } from "node:fs";
import { Movement } from "@/server/models/Movement";
import { Separation } from "@/server/models/Separation";
import { proposeMovement } from "@/server/services/movements";
import { signClearance, startSeparation, submitExitInterview } from "@/server/services/separations";
import { demoCvPdf } from "./demoPdf";

/** Kenyan defaults (Employment Act 2007). HR can change them in Leave settings. */
const LEAVE_TYPES = [
  { code: "ANNUAL", name: "Annual leave", daysPerYear: 21, dayCount: "working", proRata: true, carryOverMax: 5, order: 1,
    description: "21 working days a year. Up to 5 unused days carry over." },
  { code: "SICK", name: "Sick leave", daysPerYear: 14, dayCount: "working", minServiceMonths: 2, backdateDays: 7, order: 2,
    description: "14 days a year, after 2 months' service. Can be logged up to 7 days late." },
  { code: "MATERNITY", name: "Maternity leave", daysPerYear: 90, dayCount: "calendar", gender: "female", order: 3,
    description: "Three months on full pay." },
  { code: "PATERNITY", name: "Paternity leave", daysPerYear: 14, dayCount: "calendar", gender: "male", order: 4,
    description: "Two weeks on full pay." },
  { code: "COMPASSIONATE", name: "Compassionate leave", daysPerYear: 5, dayCount: "working", order: 5,
    description: "For bereavement or a family emergency." },
  { code: "STUDY", name: "Study / exam leave", daysPerYear: 10, dayCount: "working", paid: false, minServiceMonths: 12, order: 6,
    description: "Unpaid, for exams on an approved course." },
];

/** Gazetted each year by the Interior CS, so they're data, not code. 2027 is the expected date. */
const EXTRA_HOLIDAYS = [
  { date: "2025-03-31", name: "Idd-ul-Fitr" },
  { date: "2026-03-20", name: "Idd-ul-Fitr" },
  { date: "2027-03-10", name: "Idd-ul-Fitr (expected)" },
];

// ---- Repeatable "random" numbers, so every seed gives the same demo data ----
let state = 20261104;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join("");

const DEPARTMENTS = [
  { code: "EXEC", name: "Executive Office" },
  { code: "ENG", name: "Engineering" },
  { code: "FIN", name: "Finance" },
  { code: "HR", name: "Human Resources" },
  { code: "OPS", name: "Operations" },
  { code: "SAL", name: "Sales & Marketing" },
] as const;

type Seed = {
  key: string;
  first: string;
  last: string;
  gender: "female" | "male";
  dept: (typeof DEPARTMENTS)[number]["code"];
  title: string;
  grade: string;
  manager: string | null;
  hired: string;
  born: string;
  salary: number;
  roles: string[];
  type?: "permanent" | "contract" | "intern";
  status?: "probation" | "active" | "separated";
  /** For former staff: last working day. */
  left?: string;
};

/**
 * Earlier steps in some careers, so profiles show real history. The first
 * step is the job they were hired into; their current job is the last step.
 */
type Step = { date: string; title: string; grade: string; salary: number; dept?: string };
const CAREERS: Record<string, Step[]> = {
  david: [
    { date: "2017-03-01", title: "Senior Software Engineer", grade: "G4", salary: 160_000 },
    { date: "2020-01-01", title: "Engineering Manager", grade: "G6", salary: 300_000 },
  ],
  collins: [
    { date: "2019-07-15", title: "Software Engineer", grade: "G3", salary: 95_000 },
    { date: "2021-07-01", title: "Senior Software Engineer", grade: "G4", salary: 140_000 },
  ],
  mercy: [{ date: "2022-02-01", title: "Junior Software Engineer", grade: "G3", salary: 85_000 }],
  grace: [
    { date: "2016-09-12", title: "HR Officer", grade: "G3", salary: 90_000 },
    { date: "2019-05-01", title: "Senior HR Officer", grade: "G4", salary: 150_000 },
  ],
  kevin: [{ date: "2021-04-19", title: "HR Assistant", grade: "G2", salary: 55_000 }],
  brian: [{ date: "2020-10-01", title: "IT Support Officer", grade: "G3", salary: 80_000, dept: "OPS" }],
  daniel: [{ date: "2019-01-07", title: "Accountant", grade: "G4", salary: 120_000 }],
};
/** When each of those people moved into their current job. */
const CURRENT_FROM: Record<string, string> = {
  david: "2023-04-01", collins: "2024-01-01", mercy: "2024-03-01", grace: "2022-07-01",
  kevin: "2023-02-01", brian: "2022-06-01", daniel: "2025-01-01",
};

// The reporting tree: CEO → heads of department → their teams.
const PEOPLE: Seed[] = [
  { key: "ceo", first: "Wambui", last: "Kariuki", gender: "female", dept: "EXEC", title: "Chief Executive Officer", grade: "G8", manager: null, hired: "2015-01-05", born: "1972-06-14", salary: 820_000, roles: ["Line Manager", "Employee"] },

  { key: "david", first: "David", last: "Kiprop", gender: "male", dept: "ENG", title: "Head of Engineering", grade: "G7", manager: "ceo", hired: "2017-03-01", born: "1984-09-22", salary: 480_000, roles: ["Line Manager", "Employee"] },
  { key: "collins", first: "Collins", last: "Waweru", gender: "male", dept: "ENG", title: "Senior Software Engineer (Team Lead)", grade: "G5", manager: "david", hired: "2019-07-15", born: "1990-02-11", salary: 230_000, roles: ["Line Manager", "Employee"] },
  { key: "mercy", first: "Mercy", last: "Njeri", gender: "female", dept: "ENG", title: "Software Engineer", grade: "G4", manager: "collins", hired: "2022-02-01", born: "1997-11-03", salary: 145_000, roles: ["Employee"] },
  { key: "ian", first: "Ian", last: "Mutiso", gender: "male", dept: "ENG", title: "Software Engineer", grade: "G3", manager: "collins", hired: "2026-08-12", born: "1999-04-27", salary: 98_000, roles: ["Employee"], status: "probation" },
  { key: "naomi", first: "Naomi", last: "Wairimu", gender: "female", dept: "ENG", title: "QA Engineer", grade: "G3", manager: "collins", hired: "2023-05-02", born: "1996-08-19", salary: 92_000, roles: ["Employee"] },
  { key: "brian", first: "Brian", last: "Otieno", gender: "male", dept: "ENG", title: "IT Systems Administrator", grade: "G4", manager: "david", hired: "2020-10-01", born: "1991-12-05", salary: 150_000, roles: ["Super Admin", "Employee"] },

  { key: "grace", first: "Grace", last: "Wanjiru", gender: "female", dept: "HR", title: "Human Resources Manager", grade: "G6", manager: "ceo", hired: "2016-09-12", born: "1981-03-30", salary: 340_000, roles: ["HR Manager", "Line Manager", "Employee"] },
  { key: "kevin", first: "Kevin", last: "Mutua", gender: "male", dept: "HR", title: "HR Officer", grade: "G3", manager: "grace", hired: "2021-04-19", born: "1994-07-08", salary: 88_000, roles: ["HR Officer", "Employee"] },
  { key: "faith", first: "Faith", last: "Achieng", gender: "female", dept: "HR", title: "Talent Acquisition Specialist", grade: "G3", manager: "grace", hired: "2022-06-06", born: "1995-01-17", salary: 90_000, roles: ["Recruiter", "Employee"] },
  { key: "janet", first: "Janet", last: "Atieno", gender: "female", dept: "HR", title: "HR Assistant", grade: "G2", manager: "grace", hired: "2025-01-13", born: "2000-10-02", salary: 52_000, roles: ["Employee"], type: "contract" },

  { key: "esther", first: "Esther", last: "Mwangi", gender: "female", dept: "FIN", title: "Finance Manager", grade: "G6", manager: "ceo", hired: "2016-02-15", born: "1979-05-25", salary: 360_000, roles: ["Line Manager", "Employee"] },
  { key: "daniel", first: "Daniel", last: "Kipchumba", gender: "male", dept: "FIN", title: "Accountant", grade: "G4", manager: "esther", hired: "2019-01-07", born: "1988-08-13", salary: 135_000, roles: ["Employee"] },
  { key: "ruth", first: "Ruth", last: "Nyambura", gender: "female", dept: "FIN", title: "Payroll Officer", grade: "G3", manager: "esther", hired: "2020-03-02", born: "1990-12-21", salary: 95_000, roles: ["Payroll Officer", "Employee"] },
  { key: "francis", first: "Francis", last: "Njoroge", gender: "male", dept: "FIN", title: "Accounts Assistant", grade: "G2", manager: "esther", hired: "2001-05-14", born: "1967-02-10", salary: 62_000, roles: ["Employee"] },

  { key: "joseph", first: "Joseph", last: "Omondi", gender: "male", dept: "OPS", title: "Operations Manager", grade: "G6", manager: "ceo", hired: "2015-08-03", born: "1976-04-09", salary: 330_000, roles: ["Line Manager", "Employee"] },
  { key: "patrick", first: "Patrick", last: "Mwenda", gender: "male", dept: "OPS", title: "Logistics Officer", grade: "G3", manager: "joseph", hired: "2018-11-26", born: "1987-06-30", salary: 85_000, roles: ["Employee"] },
  { key: "agnes", first: "Agnes", last: "Moraa", gender: "female", dept: "OPS", title: "Procurement Officer", grade: "G3", manager: "joseph", hired: "2021-09-01", born: "1993-03-14", salary: 87_000, roles: ["Employee"] },
  { key: "john", first: "John", last: "Maina", gender: "male", dept: "OPS", title: "Driver", grade: "G1", manager: "joseph", hired: "1998-02-02", born: "1966-12-20", salary: 38_000, roles: ["Employee"] },

  { key: "lucy", first: "Lucy", last: "Chebet", gender: "female", dept: "SAL", title: "Sales & Marketing Manager", grade: "G6", manager: "ceo", hired: "2018-01-08", born: "1985-10-16", salary: 310_000, roles: ["Line Manager", "Employee"] },
  { key: "victor", first: "Victor", last: "Ochieng", gender: "male", dept: "SAL", title: "Sales Executive", grade: "G3", manager: "lucy", hired: "2022-10-03", born: "1996-05-05", salary: 80_000, roles: ["Employee"] },
  { key: "sharon", first: "Sharon", last: "Jepkoech", gender: "female", dept: "SAL", title: "Marketing Officer", grade: "G3", manager: "lucy", hired: "2023-02-20", born: "1998-09-09", salary: 82_000, roles: ["Employee"] },
  { key: "alex", first: "Alex", last: "Muriuki", gender: "male", dept: "SAL", title: "Sales Executive", grade: "G3", manager: "lucy", hired: "2024-04-15", born: "1997-01-28", salary: 78_000, roles: ["Employee"] },
  { key: "paul", first: "Paul", last: "Wekesa", gender: "male", dept: "SAL", title: "Sales Executive", grade: "G3", manager: "lucy", hired: "2019-03-04", born: "1992-02-02", salary: 75_000, roles: [], status: "separated", left: "2025-09-30" },
  { key: "winnie", first: "Winnie", last: "Akinyi", gender: "female", dept: "SAL", title: "Customer Success Officer", grade: "G2", manager: "lucy", hired: "2025-06-02", born: "2001-07-22", salary: 55_000, roles: ["Employee"], type: "intern" },
];

const PLACES = [
  { area: "Kilimani", town: "Nairobi", county: "Nairobi" },
  { area: "Westlands", town: "Nairobi", county: "Nairobi" },
  { area: "Kasarani", town: "Nairobi", county: "Nairobi" },
  { area: "South B", town: "Nairobi", county: "Nairobi" },
  { area: "Ruaka", town: "Ruaka", county: "Kiambu" },
  { area: "Thika Road", town: "Ruiru", county: "Kiambu" },
  { area: "Ongata Rongai", town: "Rongai", county: "Kajiado" },
  { area: "Syokimau", town: "Syokimau", county: "Machakos" },
];
const BANKS = [
  { name: "Equity Bank", branches: ["Kenyatta Avenue", "Westlands", "Thika Road Mall"] },
  { name: "KCB Bank", branches: ["Moi Avenue", "Sarit Centre", "Ruaka"] },
  { name: "Co-operative Bank", branches: ["Upper Hill", "Ruiru", "Rongai"] },
  { name: "NCBA Bank", branches: ["Mara Road", "The Junction"] },
  { name: "Absa Bank Kenya", branches: ["Queensway", "Yaya Centre"] },
];
const KIN = ["Spouse", "Mother", "Father", "Brother", "Sister"];
const KIN_NAMES = ["Mary Wanjiku", "James Mwangi", "Ann Akinyi", "Peter Kiprotich", "Jane Nekesa", "Samuel Ouma", "Lilian Chepkemoi", "George Kimani"];
const phone = () => `07${pick(["01", "10", "11", "12", "20", "22", "23", "45", "57", "68", "90", "95"])} ${digits(3)} ${digits(3)}`;

function addYears(iso: string, years: number) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function assertSafeTarget() {
  const uri = process.env.MONGODB_URI ?? "";
  const local = /mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri);
  if (!local && !process.argv.includes("--force")) {
    console.error("Refusing to wipe a non-local database. Re-run with --force if you're sure:\n  npm run seed -- --force");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data with NODE_ENV=production.");
    process.exit(1);
  }
}

/**
 * Demo dates are written for the week of Monday 2 Nov 2026 and shifted by
 * whole weeks to the week you seed in, so "away today", interviews, offers
 * and exits stay current on demo day. Whole weeks, so weekdays don't change.
 * Tests pin the original week:  npm run seed -- --today=2026-11-04
 */
const DAY = 86_400_000;
const ANCHOR_MONDAY = Date.UTC(2026, 10, 2);
const mondayOf = (t: number) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
const todayArg = process.argv.find((a) => a.startsWith("--today="))?.slice("--today=".length);
const seedToday = Date.parse(`${todayArg ?? new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)}T00:00:00Z`);
const SHIFT_DAYS = Math.round((mondayOf(seedToday) - ANCHOR_MONDAY) / DAY);
const d = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + SHIFT_DAYS * DAY).toISOString().slice(0, 10);

async function main() {
  assertSafeTarget();
  if (SHIFT_DAYS) console.log(`Shifting demo dates by ${SHIFT_DAYS / 7} week(s) to the current week.`);
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD in .env.local first.");

  await connectDB();
  console.log("Wiping database…");
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Role, Department, Employee, AuditLog, EmploymentEvent, LeaveType, LeaveRequest, LeaveAdjustment, PublicHoliday, Requisition, Vacancy, Application, Movement, Separation].map((m) => m.syncIndexes()));

  // Roles
  const roles = await Role.insertMany([
    ...SYSTEM_ROLES.map((r) => ({ ...r, grants: [...r.grants], system: true })),
    ...EXAMPLE_CUSTOM_ROLES.map((r) => ({ ...r, grants: [...r.grants], system: false })),
  ]);
  const roleId = (name: string) => {
    const r = roles.find((x) => x.name === name);
    if (!r) throw new Error(`No role ${name}`);
    return r._id;
  };

  // Departments
  const depts = await Department.insertMany(DEPARTMENTS.map((d) => ({ ...d })));
  const deptId = (code: string) => depts.find((d) => d.code === code)!._id;

  // Employees, parents before children so managerPath can be built
  const ids = new Map<string, Types.ObjectId>();
  const paths = new Map<string, Types.ObjectId[]>();
  let staffNo = 1000;
  for (const p of PEOPLE) {
    const id = new Types.ObjectId();
    ids.set(p.key, id);
    const managerPath = p.manager ? [...paths.get(p.manager)!, ids.get(p.manager)!] : [];
    paths.set(p.key, managerPath);

    const place = pick(PLACES);
    const bank = pick(BANKS);
    const nationalId = String(2 + Math.floor(rand() * 3)) + digits(7);
    await Employee.create({
      _id: id,
      staffNo: `KG-${++staffNo}`,
      firstName: p.first,
      lastName: p.last,
      gender: p.gender,
      workEmail: `${p.first}.${p.last}@kilele.co.ke`.toLowerCase(),
      jobTitle: p.title,
      grade: p.grade,
      departmentId: deptId(p.dept),
      managerId: p.manager ? ids.get(p.manager) : null,
      managerPath,
      employmentType: p.type ?? "permanent",
      status: p.status ?? "active",
      hireDate: new Date(p.hired),
      separationDate: p.left ? new Date(p.left) : null,
      retirementDate: addYears(p.born, RETIREMENT_AGE),
      contact: {
        personalEmail: `${p.first}.${p.last}${digits(2)}@example.com`.toLowerCase(),
        phone: phone(),
        address: `${place.area}, P.O. Box ${digits(5)}-00100`,
        town: place.town,
        county: place.county,
        nextOfKin: { name: pick(KIN_NAMES), relationship: pick(KIN), phone: phone() },
        emergencyContact: { name: pick(KIN_NAMES), relationship: pick(KIN), phone: phone() },
      },
      pii: {
        nationalId: encrypt(nationalId),
        kraPin: encrypt(`A0${digits(8)}${pick("ABCDEFGHJKLMNPQRSTUVWXYZ".split(""))}`),
        nssfNo: encrypt(digits(9)),
        shaNo: encrypt(`CR${digits(10)}`),
        dateOfBirth: encrypt(p.born),
        bankName: encrypt(bank.name),
        bankBranch: encrypt(pick(bank.branches)),
        bankAccount: encrypt(digits(13)),
      },
      nationalIdHash: blindIndex(nationalId),
      pay: { basicSalary: p.salary, currency: "KES" },
    });
  }

  await Counter.create({ _id: "staffNo", value: staffNo });

  // Career histories: hire, then each transfer / promotion / increment, then any exit
  const deptName = (code: string) => DEPARTMENTS.find((d) => d.code === code)!.name;
  const managerName = (key: string | null) => {
    const m = PEOPLE.find((x) => x.key === key);
    return m ? `${m.first} ${m.last}` : "(none)";
  };
  const events: Record<string, unknown>[] = [];
  for (const p of PEOPLE) {
    const current: Step = { date: CURRENT_FROM[p.key] ?? p.hired, title: p.title, grade: p.grade, salary: p.salary, dept: p.dept };
    const steps = [...(CAREERS[p.key] ?? []), current];
    const snap = (st: Step) => ({
      jobTitle: st.title,
      grade: st.grade,
      basicSalary: st.salary,
      departmentId: deptId(st.dept ?? p.dept),
      departmentName: deptName(st.dept ?? p.dept),
      managerName: managerName(p.manager),
    });
    const base = { employeeId: ids.get(p.key), actorName: "Grace Wanjiru" };
    const first = steps[0];
    events.push({ ...base, type: "hire", effectiveDate: new Date(first.date), summary: `Joined ${deptName(first.dept ?? p.dept)} as ${first.title}`, to: snap(first) });
    for (let i = 1; i < steps.length; i++) {
      const [a, b] = [steps[i - 1], steps[i]];
      if ((a.dept ?? p.dept) !== (b.dept ?? p.dept)) {
        events.push({ ...base, type: "transfer", effectiveDate: new Date(b.date), summary: `Moved from ${deptName(a.dept ?? p.dept)} to ${deptName(b.dept ?? p.dept)}`, from: snap(a), to: snap(b) });
      }
      if (a.grade !== b.grade || a.title !== b.title) {
        events.push({ ...base, type: "promotion", effectiveDate: new Date(b.date), summary: `Promoted to ${b.title}`, from: snap(a), to: snap(b) });
      } else if (a.salary !== b.salary) {
        events.push({ ...base, type: "salary_change", effectiveDate: new Date(b.date), summary: "Salary increased: annual increment", from: { basicSalary: a.salary }, to: { basicSalary: b.salary } });
      }
    }
    if (p.left) {
      events.push({ ...base, type: "separation", effectiveDate: new Date(p.left), summary: "Resigned (moved to another company)", from: snap(current), to: { status: "separated" } });
    }
  }
  await EmploymentEvent.insertMany(events);

  // Department heads
  const heads: Record<string, string> = { EXEC: "ceo", ENG: "david", FIN: "esther", HR: "grace", OPS: "joseph", SAL: "lucy" };
  for (const [code, key] of Object.entries(heads)) {
    await Department.updateOne({ code }, { headId: ids.get(key) });
  }

  // Logins: every employee, plus an external auditor with no employee record
  const passwordHash = await hashPassword(password);
  for (const p of PEOPLE.filter((x) => x.status !== "separated")) {
    await User.create({
      email: `${p.first}.${p.last}@kilele.co.ke`.toLowerCase(),
      name: `${p.first} ${p.last}`,
      passwordHash,
      roleIds: p.roles.map(roleId),
      employeeId: ids.get(p.key),
    });
  }
  await User.create({
    email: "peter.kamau@audit.kilele.co.ke",
    name: "Peter Kamau",
    passwordHash,
    roleIds: [roleId("Auditor")],
  });

  // ---- Leave: policies, holidays, and a year of requests ----------------------
  // Created through the real services with an injected clock ("as if applied on
  // 20 July"), so every request has a genuine approval trail and audit entries.
  await LeaveType.insertMany(LEAVE_TYPES);
  await PublicHoliday.insertMany(EXTRA_HOLIDAYS);

  const ctxOf = async (key: string) => ctxForUser((await User.findOne({ employeeId: ids.get(key) }).lean())!, "seed");
  const on = (iso: string) => new Date(`${d(iso)}T09:00:00+03:00`);
  type Decision = [approver: string, decision: "approve" | "reject", decidedOn: string, comment?: string];
  const leave = async (who: string, typeCode: string, start: string, end: string, appliedOn: string, decisions: Decision[] = [], extra: { reason?: string; handoverTo?: string } = {}) => {
    const id = await applyLeave(await ctxOf(who), { typeCode, start: d(start), end: d(end), ...extra }, on(appliedOn));
    for (const [approver, decision, decidedOn, comment] of decisions) {
      await decide(await ctxOf(approver), "leave", id, { decision, comment: comment ?? "" }, on(decidedOn));
    }
    return id;
  };

  // Last year: Mercy's long April break (so she carries days over into 2026)
  await leave("mercy", "ANNUAL", "2025-04-07", "2025-04-25", "2025-03-10", [["collins", "approve", "2025-03-11"], ["grace", "approve", "2025-03-12"]]);
  // Earlier this year, all approved
  await leave("mercy", "ANNUAL", "2026-08-10", "2026-08-21", "2026-07-20", [["collins", "approve", "2026-07-21"], ["grace", "approve", "2026-07-21"]], { handoverTo: "Naomi covers code reviews" });
  await leave("victor", "PATERNITY", "2026-09-01", "2026-09-14", "2026-08-03", [["lucy", "approve", "2026-08-03", "Congratulations!"], ["grace", "approve", "2026-08-04"]]);
  await leave("naomi", "SICK", "2026-10-12", "2026-10-13", "2026-10-14", [["collins", "approve", "2026-10-14", "Get well soon"], ["kevin", "approve", "2026-10-15"]], { reason: "Flu. Doctor's note handed to HR." });
  await leave("joseph", "ANNUAL", "2026-06-15", "2026-06-26", "2026-05-20", [["ceo", "approve", "2026-05-21"], ["kevin", "approve", "2026-05-21"]]);
  // Away right now (shows on the dashboard on 4 Nov)
  await leave("sharon", "ANNUAL", "2026-11-02", "2026-11-06", "2026-10-15", [["lucy", "approve", "2026-10-16"], ["kevin", "approve", "2026-10-16"]], { handoverTo: "Victor handles the newsletter" });
  // Rejected, with a reason the employee can read
  await leave("alex", "ANNUAL", "2026-12-01", "2026-12-04", "2026-10-28", [["lucy", "reject", "2026-10-29", "Quarter-end sales push. Can we move this to the second week of January?"]]);
  // Cancelled by the employee
  const agnes = await leave("agnes", "COMPASSIONATE", "2026-11-16", "2026-11-18", "2026-11-02");
  await cancelLeave(await ctxOf("agnes"), agnes, "Family matter resolved", on("2026-11-03"));
  // Waiting for decisions (the demo inboxes)
  await leave("brian", "ANNUAL", "2026-12-07", "2026-12-11", "2026-11-03", [], { reason: "Family trip to Mombasa", handoverTo: "Collins has the admin passwords vault access" });
  await leave("mercy", "ANNUAL", "2026-12-14", "2026-12-24", "2026-11-02", [], { handoverTo: "Ian takes the payments module" });
  await leave("daniel", "ANNUAL", "2026-11-23", "2026-11-27", "2026-11-02", [["esther", "approve", "2026-11-03", "Month-end close is done by then."]]);
  await leave("grace", "ANNUAL", "2026-12-28", "2026-12-31", "2026-11-01");
  // An HR correction
  await adjustBalance(await ctxOf("grace"), { employeeId: String(ids.get("patrick")), typeCode: "ANNUAL", days: 1, reason: "Worked on Mashujaa Day to receive a delivery" }, on("2026-10-21"));

  // ---- Recruitment: three hiring requests, two live adverts, a full pipeline -----
  const approveReq = async (id: string, by: string, day: string) => decide(await ctxOf(by), "requisition", id, { decision: "approve", comment: "Budgeted in the 2027 plan." }, on(day));

  // 1. Senior Frontend Engineer: requested by David, approved by Faith, advertised.
  const feReq = await createRequisition(await ctxOf("david"), {
    title: "Senior Frontend Engineer", departmentId: String(deptId("ENG")), grade: "G4", employmentType: "permanent", openings: 1,
    justification: "Two client builds (a payments dashboard and a driver app) start in January. The team has one frontend engineer, Mercy, and she is at capacity.",
  }, on("2026-10-01"));
  await approveReq(feReq, "faith", "2026-10-02");
  const feVac = await createVacancy(await ctxOf("faith"), feReq, {
    summary: "Help us build the web apps that move goods and money across East Africa: dashboards for logistics teams, and payment flows used by thousands of small businesses.",
    responsibilities: "- Build fast, accessible interfaces in React and Next.js\n- Turn designs into polished, tested features\n- Review code and mentor a junior engineer\n- Work with backend engineers on clean APIs",
    requirements: "- 3+ years building production web apps with React\n- Strong TypeScript and CSS\n- You care about accessibility and performance\n- Bonus: M-Pesa or payments experience",
    location: "Nairobi (hybrid, 3 days in office)",
    closesOn: d("2026-11-30"),
    showSalary: "on",
    publish: "on",
    criteria: "Technical skills\nProblem solving\nCommunication\nTeam fit",
    questions: JSON.stringify([
      { text: "Are you legally allowed to work in Kenya?", kind: "yesno", weight: 1, knockout: true, target: null, knockoutBelow: null },
      { text: "Years of professional experience with React or Next.js", kind: "number", weight: 3, knockout: false, target: 5, knockoutBelow: 2 },
      { text: "Have you shipped a production app used by real customers?", kind: "yesno", weight: 2, knockout: false, target: null, knockoutBelow: null },
      { text: "Expected monthly salary (KES)", kind: "number", weight: 0, knockout: false, target: null, knockoutBelow: null },
    ]),
  }, on("2026-10-02"));
  const feSlug = (await Vacancy.findById(feVac).lean())!.slug;

  type Candidate = { name: string; email: string; phone: string; location: string; answers: string[]; cover: string; cv: string[]; day: string };
  const apply = async (slug: string, c: Candidate, n: number) => {
    const fields: Record<string, string> = { name: c.name, email: c.email, phone: c.phone, location: c.location, coverLetter: c.cover, consent: "on" };
    c.answers.forEach((a, i) => (fields[`answer_q${i + 1}`] = a));
    const { token } = await submitApplication(slug, fields, { bytes: demoCvPdf(c.name, c.cv), name: `${c.name.replace(/\s+/g, "_")}_CV.pdf` }, `seed-${n}`, on(c.day));
    const app = await Application.findOne({ "candidate.email": c.email }).sort({ createdAt: -1 }).lean();
    return { id: String(app!._id), token, name: c.name };
  };
  const fe = [
    { name: "Achieng Odhiambo", email: "achieng.odhiambo@example.com", phone: "0722 410 118", location: "Nairobi", answers: ["yes", "6", "yes", "180000"],
      cover: "I lead the frontend for a Nairobi fintech's merchant dashboard (40k monthly users). I'd love to build tools for logistics teams next.",
      cv: ["Frontend Lead, a Nairobi fintech (2022 - now)", "Software Engineer, an e-commerce startup (2019 - 2022)", "BSc Computer Science, JKUAT", "React, Next.js, TypeScript, accessibility, M-Pesa Daraja API"], day: "2026-10-06" },
    { name: "Kipchirchir Langat", email: "kip.langat@example.com", phone: "0711 902 345", location: "Eldoret", answers: ["yes", "4", "yes", "150000"],
      cover: "Four years of React at an agency, building sites for NGOs and banks. Happy to relocate to Nairobi.",
      cv: ["Frontend Developer, a digital agency (2022 - now)", "Junior Developer, an NGO tech team (2021 - 2022)", "BSc IT, Moi University", "React, Vue, Tailwind, Figma"], day: "2026-10-08" },
    { name: "Wanjiku Mwangi", email: "wanjiku.m@example.com", phone: "0733 118 272", location: "Thika", answers: ["yes", "3", "no", "130000"],
      cover: "", cv: ["Web Developer, a hospital group (2023 - now)", "Diploma in Software Development", "React, Node.js, MongoDB"], day: "2026-10-09" },
    { name: "Otieno Ouma", email: "otieno.ouma@example.com", phone: "0700 655 901", location: "Kisumu", answers: ["yes", "1", "yes", "90000"],
      cover: "I'm early in my career but I learn fast. I built my county's events site.", cv: ["Freelance web developer (2025 - now)", "Certificate, Moringa School", "HTML, CSS, JavaScript, React"], day: "2026-10-10" },
    { name: "Fatuma Hassan", email: "fatuma.hassan@example.com", phone: "+255 754 300 112", location: "Dar es Salaam", answers: ["no", "5", "yes", "200000"],
      cover: "Senior engineer in Dar es Salaam, looking to move to Nairobi next year.", cv: ["Senior Frontend Engineer, a Tanzanian telco (2021 - now)", "BSc Computer Engineering, UDSM", "React, React Native, GraphQL"], day: "2026-10-11" },
    { name: "Brian Mutai", email: "brian.mutai@example.com", phone: "0790 223 410", location: "Nakuru", answers: ["yes", "2", "no", "110000"],
      cover: "", cv: ["Junior Developer, a SACCO (2024 - now)", "BSc Computer Science, Egerton University"], day: "2026-10-12" },
  ];
  const apps = [];
  for (const [i, c] of fe.entries()) apps.push(await apply(feSlug, c, i));
  const [achieng, kip, wanjiku, , , mutai] = apps;

  const faith = await ctxOf("faith");
  for (const a of [achieng, kip, wanjiku]) await moveStage(faith, a.id, { to: "shortlisted", note: "Strong screening answers" }, on("2026-10-14"));
  await moveStage(faith, mutai.id, { to: "rejected", note: "Stronger candidates shortlisted" }, on("2026-10-14"));

  // Achieng: interviewed, both panellists scored, offered, accepted → ready for HR to hire (the live demo)
  const panel = [String(ids.get("david")), String(ids.get("collins"))];
  await scheduleInterview(faith, achieng.id, { at: `${d("2026-10-22")}T10:00`, durationMins: 60, mode: "in_person", where: "Boardroom, 4th floor", panelIds: panel }, on("2026-10-15"));
  const ivA = String((await Application.findById(achieng.id).lean())!.interviews[0]._id);
  const score = async (who: string, appId: string, interviewId: string, s: number[], recommendation: string, notes: string) =>
    submitScorecard(await ctxOf(who), appId, { interviewId, recommendation, notes, ...Object.fromEntries(s.map((x, i) => [`score_${i}`, String(x)])) }, on("2026-10-22"));
  await score("david", achieng.id, ivA, [5, 4, 5, 4], "strong_yes", "Clear thinker. Walked us through an accessibility fix she shipped, with numbers. Would raise the bar.");
  await score("collins", achieng.id, ivA, [4, 5, 4, 5], "yes", "Great pairing exercise; asked good questions about our API. Slightly light on testing.");
  await makeOffer(faith, achieng.id, { basicSalary: "165000", expiresOn: d("2026-11-09"), startDate: d("2026-12-01") }, on("2026-11-02"));
  await candidateRespond(achieng.token, "accept", "seed", on("2026-11-03"));

  // Kip: interview next week; Collins has scored, David hasn't (demo: hidden scorecards)
  await scheduleInterview(faith, kip.id, { at: `${d("2026-11-12")}T14:00`, durationMins: 45, mode: "video", where: "Google Meet link sent by email", panelIds: panel }, on("2026-10-20"));
  const ivK = String((await Application.findById(kip.id).lean())!.interviews[0]._id);
  await score("collins", kip.id, ivK, [4, 3, 4, 4], "yes", "Solid React fundamentals. Needs to grow in system design, but coachable.");

  // 2. Accounts Assistant: waiting for Talent & HR approval (shows in Faith's and Grace's inboxes)
  await createRequisition(await ctxOf("esther"), {
    title: "Accounts Assistant", departmentId: String(deptId("FIN")), grade: "G2", employmentType: "permanent", openings: 1,
    replacesEmployeeId: String(ids.get("francis")),
    justification: "Francis Njoroge retires in February 2027. We need overlap to hand over accounts payable before he leaves.",
  }, on("2026-11-02"));

  // 3. Sales Executive × 2: approved by Grace, advertised, two fresh applications
  const salesReq = await createRequisition(await ctxOf("lucy"), {
    title: "Sales Executive", departmentId: String(deptId("SAL")), grade: "G3", employmentType: "permanent", openings: 2,
    justification: "New Mombasa and Kisumu territories from Q1 2027 need dedicated account owners.",
  }, on("2026-10-20"));
  await approveReq(salesReq, "grace", "2026-10-21");
  const salesVac = await createVacancy(faith, salesReq, {
    summary: "Own our relationships with logistics companies in a new region, from first meeting to signed contract.",
    responsibilities: "- Find and win new business customers\n- Run product demos with our solutions team\n- Keep the CRM honest",
    requirements: "- 2+ years in B2B sales\n- Comfortable presenting to company owners\n- Valid driving licence",
    location: "Mombasa or Kisumu", closesOn: d("2026-12-15"), showSalary: "on", publish: "on", criteria: "Sales skill\nCommunication\nDrive",
    questions: JSON.stringify([
      { text: "Do you hold a valid Kenyan driving licence?", kind: "yesno", weight: 1, knockout: true, target: null, knockoutBelow: null },
      { text: "Years of B2B sales experience", kind: "number", weight: 2, knockout: false, target: 4, knockoutBelow: 1 },
    ]),
  }, on("2026-10-21"));
  const salesSlug = (await Vacancy.findById(salesVac).lean())!.slug;
  const sales = [
    await apply(salesSlug, { name: "Halima Abdi", email: "halima.abdi@example.com", phone: "0722 900 431", location: "Mombasa", answers: ["yes", "5"], cover: "Five years selling freight services at the port.", cv: ["Key Account Manager, a freight forwarder (2021 - now)", "BCom Marketing, Technical University of Mombasa"], day: "2026-10-28" }, 10),
    await apply(salesSlug, { name: "Ochieng Were", email: "ochieng.were@example.com", phone: "0714 200 876", location: "Kisumu", answers: ["yes", "3"], cover: "", cv: ["Sales Representative, an FMCG distributor (2023 - now)", "Diploma in Sales and Marketing"], day: "2026-10-30" }, 11),
  ];

  // Candidates' private status links, for demoing the candidate's side
  const links = [...apps, ...sales].map((a) => `${a.name.padEnd(20)} http://localhost:3000/careers/status/${a.token}`).join("\n");
  writeFileSync(".demo-links.txt", `Candidate status pages (demo data; regenerated by npm run seed)\n\n${links}\n`);

  // ---- Promotions --------------------------------------------------------------
  const decideAs = async (type: string, who: string, id: string, day: string, comment = "") =>
    decide(await ctxOf(who), type, id, { decision: "approve", comment }, on(day));

  // Mercy: proposed by her team lead Collins, now waiting for David (the demo)
  await proposeMovement(await ctxOf("collins"), {
    employeeId: String(ids.get("mercy")), jobTitle: "Senior Software Engineer", grade: "G5", effectiveDate: d("2026-11-02"),
    justification: "Led the payments-module rewrite that cut checkout errors by 40%, mentors Ian, and already covers on-call for the team.",
  }, on("2026-11-02"));
  // Victor: approved by the CEO and HR, takes effect next month (shows as Scheduled)
  const victor = await proposeMovement(await ctxOf("lucy"), {
    employeeId: String(ids.get("victor")), jobTitle: "Senior Sales Executive", grade: "G4", effectiveDate: d("2026-12-01"),
    justification: "Top performer two quarters running: closed the two largest logistics accounts of the year and will lead the new Mombasa territory.",
  }, on("2026-10-26"));
  await decideAs("promotion", "ceo", victor, "2026-10-27", "Well deserved.");
  await decideAs("promotion", "grace", victor, "2026-10-28");

  // ---- Exits ---------------------------------------------------------------------
  // Patrick resigned. Approved, nearly cleared: only IT's "switch off access" is left.
  // When Brian signs it in the demo, the record closes and Patrick's login stops working.
  const patrick = await startSeparation(await ctxOf("patrick"), {
    employeeId: String(ids.get("patrick")), kind: "resignation", lastDay: d("2026-11-02"),
    reason: "I've accepted a logistics manager role in Mombasa, closer to my family. Thank you for six great years.",
  }, on("2026-10-05"));
  await decideAs("separation", "joseph", patrick, "2026-10-06", "Sad to see you go. Handover plan agreed.");
  await decideAs("separation", "grace", patrick, "2026-10-07");
  const sep = (await Separation.findById(patrick).lean())!;
  const signer: Record<string, string> = { "Engineering": "david", "Finance": "esther", "Human Resources": "kevin", "Operations": "joseph" };
  for (const c of sep.clearance) {
    if (c.item === "Email and system access switched off") continue; // left for Brian, live
    await signClearance(await ctxOf(signer[c.departmentName]), patrick, String(c._id), "", on("2026-10-30"));
  }
  await submitExitInterview(await ctxOf("patrick"), patrick, {
    reason: "Relocation", wouldRecommend: "yes", rating_0: "5", rating_1: "4", rating_2: "3", rating_3: "4", rating_4: "5",
    comments: "Great team and a fair manager. Pay for logistics officers is behind the market; that came up a lot in my job search.",
  }, on("2026-10-29"));

  // Winnie resigned; waiting for her manager Lucy
  await startSeparation(await ctxOf("winnie"), {
    employeeId: String(ids.get("winnie")), kind: "resignation", lastDay: d("2026-11-30"),
    reason: "I'm going back to university full time in January.",
  }, on("2026-11-02"));
  // Francis turns 60 in February: HR has started his retirement; waiting for Esther
  await startSeparation(await ctxOf("grace"), {
    employeeId: String(ids.get("francis")), kind: "retirement", lastDay: "2027-02-10",
    reason: "Mandatory retirement at 60. Francis has asked to help train his replacement in January.",
  }, on("2026-11-03"));

  const leaveCount = await LeaveRequest.countDocuments();
  const accounts = await User.countDocuments();
  await record(SYSTEM, {
    action: "system.seed",
    summary: `Loaded demo data: ${roles.length} roles, ${depts.length} departments, ${PEOPLE.length} employees (${events.length} career events), ${accounts} accounts`,
  });

  console.log(`Seeded ${roles.length} roles, ${depts.length} departments, ${PEOPLE.length} employees, ${events.length} career events, ${accounts} accounts, ${leaveCount} leave requests, ${await Application.countDocuments()} job applications.`);
  console.log("Candidate status links: .demo-links.txt");
  console.log("Every demo account's password is DEMO_PASSWORD from .env.local.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
