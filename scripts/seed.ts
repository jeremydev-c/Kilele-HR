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
import { record, SYSTEM } from "@/server/audit";
import { EXAMPLE_CUSTOM_ROLES, SYSTEM_ROLES } from "@/server/roles";

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
  status?: "probation" | "active";
};

// The reporting tree: CEO → heads of department → their teams.
const PEOPLE: Seed[] = [
  { key: "ceo", first: "Wambui", last: "Kariuki", gender: "female", dept: "EXEC", title: "Chief Executive Officer", grade: "G8", manager: null, hired: "2015-01-05", born: "1972-06-14", salary: 820_000, roles: ["Line Manager", "Employee"] },

  { key: "david", first: "David", last: "Kiprop", gender: "male", dept: "ENG", title: "Head of Engineering", grade: "G7", manager: "ceo", hired: "2017-03-01", born: "1984-09-22", salary: 480_000, roles: ["Line Manager", "Employee"] },
  { key: "collins", first: "Collins", last: "Waweru", gender: "male", dept: "ENG", title: "Senior Software Engineer (Team Lead)", grade: "G5", manager: "david", hired: "2019-07-15", born: "1990-02-11", salary: 230_000, roles: ["Line Manager", "Employee"] },
  { key: "mercy", first: "Mercy", last: "Njeri", gender: "female", dept: "ENG", title: "Software Engineer", grade: "G4", manager: "collins", hired: "2022-02-01", born: "1997-11-03", salary: 145_000, roles: ["Employee"] },
  { key: "ian", first: "Ian", last: "Mutiso", gender: "male", dept: "ENG", title: "Software Engineer", grade: "G3", manager: "collins", hired: "2024-08-12", born: "1999-04-27", salary: 98_000, roles: ["Employee"], status: "probation" },
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

async function main() {
  assertSafeTarget();
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD in .env.local first.");

  await connectDB();
  console.log("Wiping database…");
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Role, Department, Employee, AuditLog].map((m) => m.syncIndexes()));

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

  // Department heads
  const heads: Record<string, string> = { EXEC: "ceo", ENG: "david", FIN: "esther", HR: "grace", OPS: "joseph", SAL: "lucy" };
  for (const [code, key] of Object.entries(heads)) {
    await Department.updateOne({ code }, { headId: ids.get(key) });
  }

  // Logins: every employee, plus an external auditor with no employee record
  const passwordHash = await hashPassword(password);
  for (const p of PEOPLE) {
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

  await record(SYSTEM, {
    action: "system.seed",
    summary: `Loaded demo data: ${roles.length} roles, ${depts.length} departments, ${PEOPLE.length} employees, ${PEOPLE.length + 1} accounts`,
  });

  console.log(`Seeded ${roles.length} roles, ${depts.length} departments, ${PEOPLE.length} employees, ${PEOPLE.length + 1} accounts.`);
  console.log("Every demo account's password is DEMO_PASSWORD from .env.local.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
