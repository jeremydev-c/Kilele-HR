import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB, withTransaction } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { scoreAnswers, type Question } from "@/lib/screening";
import { toISODate } from "@/lib/leaveDays";
import { Employee, type EmployeeRecord } from "../models/Employee";
import { Department } from "../models/Department";
import { User } from "../models/User";
import { nextNumber } from "../models/Counter";
import {
  Application, Requisition, Vacancy, type ApplicationDoc, type RequisitionRecord, type Stage, type VacancyRecord,
} from "../models/Recruitment";
import { Separation } from "../models/Separation";
import { authorize, can, has, scopeFilter } from "../authz";
import { record, type Actor } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { decisionRight, startWorkflow, type WorkflowDef } from "../workflow";
import { ctxForUser, type Ctx } from "../context";
import { readCv, saveCv } from "../files";
import { allow } from "../rateLimit";
import { createEmployee } from "./employees";

type Stored = EmployeeRecord & { _id: Types.ObjectId };
type ReqDoc = RequisitionRecord & { _id: Types.ObjectId };
type VacDoc = VacancyRecord & { _id: Types.ObjectId };

const objectId = z.string().refine((s) => Types.ObjectId.isValid(s), "Pick one from the list.");
const isoDate = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);
const today = (now = new Date()) => toISODate(new Date(now.getTime() + 3 * 3_600_000));

/** Headcount is money: every requisition is approved by Talent/HR (and never by the person asking). */
export const REQUISITION_WORKFLOW: WorkflowDef = {
  steps: [{ key: "talent", label: "Talent & HR", approver: { kind: "permission", perm: "recruitment:manage", scope: "all" } }],
  distinctApprovers: true,
};

// ---------------------------------------------------------------------------
// Who may see hiring data
// ---------------------------------------------------------------------------

const isRecruiter = (ctx: Ctx) => has(ctx, "recruitment:manage") || has(ctx, "application:review");
const isHiringManager = (ctx: Ctx, v: Pick<VacDoc, "hiringManagerId">) => ctx.employee?.id === String(v.hiringManagerId);
const onPanel = (ctx: Ctx, a: Pick<ApplicationDoc, "interviews">) =>
  !!ctx.employee && a.interviews.some((i) => i.panel.some((p) => String(p.employeeId) === ctx.employee!.id));

function canSeeVacancyPipeline(ctx: Ctx, v: VacDoc) {
  return isRecruiter(ctx) || isHiringManager(ctx, v);
}

// ---------------------------------------------------------------------------
// Requisitions
// ---------------------------------------------------------------------------

const RequisitionInput = z.object({
  title: z.string().trim().min(3, "Give the job a title.").max(100),
  departmentId: objectId,
  grade: z.enum(GRADES.map((g) => g.code) as [string, ...string[]], { message: "Choose a grade." }),
  employmentType: z.enum(["permanent", "contract", "intern"]),
  openings: z.coerce.number().int().min(1).max(20),
  justification: z.string().trim().min(20, "Explain why this hire is needed (at least 20 characters)."),
  replacesEmployeeId: z.preprocess((v) => (v === "" ? undefined : v), objectId.optional()),
});

export async function createRequisition(ctx: Ctx, input: unknown, now = new Date()) {
  authorize(ctx, "requisition:create");
  if (!ctx.employee) throw new AppError("Only employees can request a hire.");
  const data = RequisitionInput.parse(input);
  await connectDB();
  // Managers ask for their own department; Talent can raise one for anyone.
  if (data.departmentId !== ctx.employee.departmentId && !has(ctx, "recruitment:manage")) {
    throw new ForbiddenError("You can only request hires for your own department.");
  }
  const [me, dept, replaces] = await Promise.all([
    Employee.findById(ctx.employee.id).lean<Stored>(),
    Department.findById(data.departmentId).lean(),
    data.replacesEmployeeId ? Employee.findById(data.replacesEmployeeId).lean<Stored>() : null,
  ]);
  if (!me || !dept) throw new AppError("Pick a department.");
  if (data.replacesEmployeeId && (!replaces || String(replaces.departmentId) !== data.departmentId || !can(ctx, "employee:read", replaces))) {
    throw new AppError("A replacement must be for someone in the same department that you can see.");
  }

  const year = now.getUTCFullYear();
  const id = await withTransaction(async (session) => {
    const number = `REQ-${year}-${String(await nextNumber(`req-${year}`, session)).padStart(4, "0")}`;
    const workflow = await startWorkflow(REQUISITION_WORKFLOW, me, ctx, now);
    const [doc] = await Requisition.create(
      [{
        ...data,
        replacesEmployeeId: replaces?._id ?? null,
        replacesName: replaces ? `${replaces.firstName} ${replaces.lastName}` : null,
        number, hiringManagerId: me._id, hiringManagerName: `${me.firstName} ${me.lastName}`, workflow,
      }],
      { session },
    );
    return doc;
  });
  await record(ctx, {
    action: "recruitment.requisition.create",
    entity: "requisition",
    entityId: String(id._id),
    summary: `Requested ${data.openings} × ${data.title} for ${dept.name} (${id.number})${replaces ? `, replacing ${replaces.firstName} ${replaces.lastName}` : ""}`,
    reason: data.justification,
  });
  return String(id._id);
}

// ---------------------------------------------------------------------------
// Hiring suggestions: simple, explainable rules (no guessing)
// ---------------------------------------------------------------------------

export type HiringSuggestion = {
  employeeId: string;
  name: string;
  jobTitle: string;
  grade: string;
  departmentId: string;
  departmentName: string;
  why: string;
  when: string; // ISO date they leave or retire
};

/**
 * People whose job may need filling, for this person's area:
 *   1. someone with an exit in progress (or who left in the last 60 days)
 *   2. someone reaching 60 within 6 months (only if you may see retirement dates: they reveal age)
 * Anyone who already has a replacement request is skipped, whatever its outcome:
 * once it has been asked and decided (even declined), it isn't suggested again.
 */
export async function hiringSuggestions(ctx: Ctx, now = new Date()): Promise<HiringSuggestion[]> {
  if (!has(ctx, "requisition:create") || !ctx.employee) return [];
  await connectDB();
  const deptFilter = has(ctx, "recruitment:manage") ? {} : { departmentId: new Types.ObjectId(ctx.employee.departmentId) };
  const since = new Date(now.getTime() - 60 * 86_400_000);
  const soon = new Date(now.getTime() + 183 * 86_400_000);

  const [exits, covered, depts] = await Promise.all([
    Separation.find({
      ...deptFilter,
      "workflow.status": { $in: ["pending", "approved"] },
      $or: [{ completedAt: null }, { completedAt: { $gte: since } }],
    }).lean(),
    Requisition.find({ replacesEmployeeId: { $ne: null } }).select("replacesEmployeeId").lean(),
    Department.find().select("name").lean(),
  ]);
  const done = new Set(covered.map((r) => String(r.replacesEmployeeId)));
  const deptName = new Map(depts.map((d) => [String(d._id), d.name]));
  const out: HiringSuggestion[] = [];
  const seen = new Set<string>();

  const people = await Employee.find({ _id: { $in: exits.map((x) => x.employeeId) } }).lean<Stored[]>();
  for (const x of exits) {
    const e = people.find((p) => String(p._id) === String(x.employeeId));
    if (!e || done.has(String(e._id)) || seen.has(String(e._id))) continue;
    seen.add(String(e._id));
    out.push({
      employeeId: String(e._id), name: `${e.firstName} ${e.lastName}`, jobTitle: e.jobTitle, grade: e.grade,
      departmentId: String(e.departmentId), departmentName: deptName.get(String(e.departmentId)) ?? "",
      why: x.kind === "retirement" ? "Retiring" : x.kind === "resignation" ? "Resigned" : "Leaving",
      when: x.lastDay,
    });
  }

  const pii = scopeFilter(ctx, "employee.pii:read");
  if (pii) {
    const retiring = await Employee.find({
      $and: [pii, deptFilter, { status: { $ne: "separated" }, retirementDate: { $gte: now, $lte: soon } }],
    }).lean<Stored[]>();
    for (const e of retiring) {
      if (done.has(String(e._id)) || seen.has(String(e._id))) continue;
      out.push({
        employeeId: String(e._id), name: `${e.firstName} ${e.lastName}`, jobTitle: e.jobTitle, grade: e.grade,
        departmentId: String(e.departmentId), departmentName: deptName.get(String(e.departmentId)) ?? "",
        why: "Turns 60", when: toISODate(e.retirementDate!),
      });
    }
  }
  return out.sort((a, b) => a.when.localeCompare(b.when));
}

export async function listRequisitions(ctx: Ctx) {
  if (!has(ctx, "requisition:create") && !isRecruiter(ctx)) throw new ForbiddenError();
  await connectDB();
  const filter = has(ctx, "recruitment:manage") ? {} : { hiringManagerId: ctx.employee ? new Types.ObjectId(ctx.employee.id) : null };
  const [reqs, depts] = await Promise.all([
    Requisition.find(filter).sort({ createdAt: -1 }).limit(100).lean<ReqDoc[]>(),
    Department.find().select("name").lean(),
  ]);
  const deptName = new Map(depts.map((d) => [String(d._id), d.name]));
  return reqs.map((r) => ({ ...r, departmentName: deptName.get(String(r.departmentId)) ?? "" }));
}

export async function getRequisition(ctx: Ctx, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Requisition");
  await connectDB();
  const r = await Requisition.findById(id).lean<ReqDoc>();
  if (!r) throw new NotFoundError("Requisition");
  const right = decisionRight(ctx, r.workflow);
  const mine = ctx.employee?.id === String(r.hiringManagerId);
  if (!mine && !has(ctx, "recruitment:manage") && !right.ok) throw new ForbiddenError();
  const dept = await Department.findById(r.departmentId).select("name").lean();
  return { req: r, departmentName: dept?.name ?? "", canDecide: right.ok, whyNot: right.ok ? null : right.why, canPublish: has(ctx, "recruitment:manage") && r.workflow.status === "approved" && !r.vacancyId };
}

// ---------------------------------------------------------------------------
// Vacancies (job adverts)
// ---------------------------------------------------------------------------

const QuestionInput = z.object({
  text: z.string().trim().min(5).max(200),
  kind: z.enum(["yesno", "number"]),
  weight: z.coerce.number().min(0).max(5).default(1),
  knockout: z.coerce.boolean().default(false),
  target: z.coerce.number().positive().nullable().default(null),
  knockoutBelow: z.coerce.number().min(0).nullable().default(null),
});

const VacancyInput = z.object({
  summary: z.string().trim().min(30, "Write a short summary (at least 30 characters).").max(1000),
  responsibilities: z.string().trim().max(3000).default(""),
  requirements: z.string().trim().max(3000).default(""),
  location: z.string().trim().min(2).max(80).default("Nairobi"),
  closesOn: isoDate("Choose a closing date."),
  showSalary: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  publish: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()).default(true),
  questions: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v || "[]") : v), z.array(QuestionInput).max(10)),
  criteria: z.preprocess(
    (v) => (typeof v === "string" ? v.split(/\n|,/).map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().max(60)).min(1, "Add at least one interview criterion.").max(8),
  ),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function createVacancy(ctx: Ctx, requisitionId: string, input: unknown, now = new Date()) {
  authorize(ctx, "recruitment:manage");
  const data = VacancyInput.parse(input);
  if (data.closesOn < today(now)) throw new AppError("The closing date is in the past.");
  await connectDB();
  const req = await Requisition.findById(requisitionId).lean<ReqDoc>();
  if (!req) throw new NotFoundError("Requisition");
  if (req.workflow.status !== "approved") throw new AppError("This requisition hasn't been approved yet.");
  if (req.vacancyId) throw new AppError("This requisition already has an advert.");
  const dept = await Department.findById(req.departmentId).lean();

  const vacancy = await Vacancy.create({
    slug: `${slugify(req.title)}-${req.number.slice(-4)}`,
    requisitionId: req._id,
    title: req.title,
    departmentId: req.departmentId,
    departmentName: dept?.name ?? "",
    grade: req.grade,
    employmentType: req.employmentType,
    openings: req.openings,
    hiringManagerId: req.hiringManagerId,
    summary: data.summary,
    responsibilities: data.responsibilities,
    requirements: data.requirements,
    location: data.location,
    closesOn: data.closesOn,
    showSalary: data.showSalary,
    questions: data.questions.map((q, i) => ({ ...q, key: `q${i + 1}` })),
    criteria: data.criteria,
    status: data.publish ? "open" : "draft",
    publishedAt: data.publish ? now : null,
  });
  await Requisition.updateOne({ _id: req._id }, { vacancyId: vacancy._id });
  await record(ctx, {
    action: "recruitment.vacancy.create",
    entity: "vacancy",
    entityId: String(vacancy._id),
    summary: `${data.publish ? "Published" : "Drafted"} the advert "${req.title}" (closes ${data.closesOn})`,
  });
  return String(vacancy._id);
}

export async function setVacancyStatus(ctx: Ctx, id: string, status: "open" | "closed") {
  authorize(ctx, "recruitment:manage");
  await connectDB();
  const v = await Vacancy.findById(id);
  if (!v) throw new NotFoundError("Vacancy");
  if (v.status === "filled") throw new AppError("This vacancy is filled.");
  if (status === "open" && v.closesOn < today()) throw new AppError("Move the closing date forward first.");
  const before = v.status;
  v.status = status;
  if (status === "open" && !v.publishedAt) v.publishedAt = new Date();
  await v.save();
  await record(ctx, {
    action: `recruitment.vacancy.${status === "open" ? "open" : "close"}`,
    entity: "vacancy",
    entityId: id,
    summary: `${status === "open" ? "Opened" : "Closed"} the advert "${v.title}"`,
    changes: [{ field: "status", from: before, to: status }],
  });
}

export async function listVacancies(ctx: Ctx) {
  await connectDB();
  const filter = isRecruiter(ctx) ? {} : ctx.employee ? { hiringManagerId: new Types.ObjectId(ctx.employee.id) } : null;
  if (!filter) throw new ForbiddenError();
  const vacancies = await Vacancy.find(filter).sort({ createdAt: -1 }).lean<VacDoc[]>();
  const counts = await Application.aggregate<{ _id: { v: Types.ObjectId; s: Stage }; n: number }>([
    { $match: { vacancyId: { $in: vacancies.map((v) => v._id) } } },
    { $group: { _id: { v: "$vacancyId", s: "$stage" }, n: { $sum: 1 } } },
  ]);
  return vacancies.map((v) => {
    const byStage: Partial<Record<Stage, number>> = {};
    for (const c of counts) if (String(c._id.v) === String(v._id)) byStage[c._id.s] = c.n;
    return { ...v, byStage, total: Object.values(byStage).reduce((s, n) => s + n, 0) };
  });
}

export async function getVacancyBoard(ctx: Ctx, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Vacancy");
  await connectDB();
  const v = await Vacancy.findById(id).lean<VacDoc>();
  if (!v) throw new NotFoundError("Vacancy");
  if (!canSeeVacancyPipeline(ctx, v)) throw new ForbiddenError();
  const apps = await Application.find({ vacancyId: v._id })
    .select("number candidate.name candidate.location score knockouts stage interviews.at interviews.scorecards.recommendation createdAt")
    .sort({ score: -1, createdAt: 1 })
    .lean<ApplicationDoc[]>();
  return { vacancy: v, applications: apps, canManage: has(ctx, "recruitment:manage") };
}

// ---------------------------------------------------------------------------
// The public careers site (no login)
// ---------------------------------------------------------------------------

export async function openVacancies(now = new Date()) {
  await connectDB();
  return Vacancy.find({ status: "open", closesOn: { $gte: today(now) } })
    .select("slug title departmentName location employmentType closesOn summary grade showSalary")
    .sort({ publishedAt: -1 })
    .lean<VacDoc[]>();
}

export async function publicVacancy(slug: string, now = new Date()) {
  await connectDB();
  const v = await Vacancy.findOne({ slug, status: "open", closesOn: { $gte: today(now) } }).lean<VacDoc>();
  if (!v) throw new NotFoundError("Job");
  // Only what a candidate should see: no hiring manager, no requisition, no internal ids.
  return {
    slug: v.slug, title: v.title, departmentName: v.departmentName, location: v.location, employmentType: v.employmentType,
    closesOn: v.closesOn, summary: v.summary, responsibilities: v.responsibilities, requirements: v.requirements,
    salary: v.showSalary ? GRADES.find((g) => g.code === v.grade) ?? null : null,
    questions: v.questions.map((q) => ({ key: q.key, text: q.text, kind: q.kind as "yesno" | "number" })),
  };
}

const kenyanOrIntlPhone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => /^(?:\+?\d{9,15}|0[17]\d{8})$/.test(s), "Enter a phone number we can call, e.g. 0712 345 678.");

const ApplyInput = z.object({
  name: z.string().trim().min(3, "Enter your full name.").max(100),
  email: z.email("Enter a valid email.").transform((s) => s.toLowerCase().trim()),
  phone: kenyanOrIntlPhone,
  location: z.string().trim().max(80).default(""),
  coverLetter: z.string().trim().max(3000, "Keep the cover note under 3,000 characters.").default(""),
  consent: z.literal("on", { message: "Please agree so we can process your application." }),
});

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Anyone on the internet can call this, so: rate-limited per IP, a hidden
 * honeypot field for bots, PDF-only CV, one application per email per job,
 * and only the data recruitment needs (no ID numbers until someone is hired).
 */
export async function submitApplication(
  slug: string,
  fields: Record<string, string>,
  cv: { bytes: Uint8Array; name: string } | null,
  ip: string | null,
  now = new Date(),
) {
  if (fields.website) throw new AppError("Something went wrong. Please try again."); // honeypot: humans never see it
  if (!allow(`apply:${ip ?? "unknown"}`, 5, 60 * 60_000)) throw new AppError("Too many applications from this connection. Try again in an hour.");
  const data = ApplyInput.parse(fields);
  await connectDB();
  const v = await Vacancy.findOne({ slug, status: "open", closesOn: { $gte: today(now) } }).lean<VacDoc>();
  if (!v) throw new AppError("This job is no longer taking applications.");
  if (await Application.exists({ vacancyId: v._id, "candidate.email": data.email })) {
    throw new AppError("You've already applied for this job with that email. Use the status link you were given to follow it.");
  }

  const answers: Record<string, string> = {};
  for (const q of v.questions) {
    const a = (fields[`answer_${q.key}`] ?? "").trim();
    if (!a) throw new AppError(`Please answer: "${q.text}"`);
    if (q.kind === "number" && !(Number(a) >= 0)) throw new AppError(`"${q.text}" needs a number.`);
    answers[q.key] = a;
  }
  const { score, knockouts } = scoreAnswers(v.questions as Question[], answers);
  if (!cv) throw new AppError("Attach your CV as a PDF.");
  const cvFileId = await saveCv(cv.bytes, cv.name);

  const token = randomBytes(24).toString("base64url");
  const year = now.getUTCFullYear();
  const number = `APP-${year}-${String(await nextNumber(`app-${year}`)).padStart(4, "0")}`;
  const app = await Application.create({
    number,
    vacancyId: v._id,
    candidate: { name: data.name, email: data.email, phone: data.phone, location: data.location },
    coverLetter: data.coverLetter,
    answers: Object.entries(answers).map(([key, value]) => ({ key, value })),
    score,
    knockouts,
    cvFileId,
    cvName: cv.name,
    stage: "new",
    history: [{ stage: "new", at: now, byName: data.name, note: "Applied online" }],
    statusTokenHash: hashToken(token),
    consentAt: now,
    ip,
  });
  const actor: Actor = { id: null, name: `Applicant: ${data.name}`, ip };
  await record(actor, {
    action: "recruitment.application.submit",
    entity: "application",
    entityId: String(app._id),
    summary: `Applied for ${v.title} (${number}), screening score ${score}${knockouts.length ? `, ${knockouts.length} minimum requirement(s) not met` : ""}`,
  });
  return { token, number };
}

const CANDIDATE_LABELS: Record<Stage, string> = {
  new: "Received",
  shortlisted: "Shortlisted",
  interview: "Invited to interview",
  offer: "Offer made",
  accepted: "Offer accepted",
  hired: "Hired: welcome aboard!",
  rejected: "Not successful this time",
  withdrawn: "Withdrawn",
  declined: "Offer declined",
};

/** What the candidate sees on their private status page. No scores, notes or interviewer names. */
export async function candidateStatus(token: string) {
  await connectDB();
  const a = await Application.findOne({ statusTokenHash: hashToken(token) }).lean<ApplicationDoc>();
  if (!a) throw new NotFoundError("Application");
  const v = await Vacancy.findById(a.vacancyId).select("title departmentName").lean();
  const upcoming = a.interviews.filter((i) => i.at > new Date()).map((i) => ({ at: i.at, durationMins: i.durationMins, mode: i.mode, where: i.where }));
  return {
    number: a.number,
    name: a.candidate.name,
    job: v?.title ?? "",
    department: v?.departmentName ?? "",
    stage: a.stage as Stage,
    label: CANDIDATE_LABELS[a.stage as Stage],
    appliedAt: a.history[0]?.at ?? a.createdAt,
    interviews: a.stage === "interview" ? upcoming : [],
    offer: a.stage === "offer" || a.stage === "accepted" ? a.offer : null,
    canWithdraw: ["new", "shortlisted", "interview", "offer"].includes(a.stage),
  };
}

export async function candidateRespond(token: string, action: "accept" | "decline" | "withdraw", ip: string | null, now = new Date()) {
  if (!allow(`respond:${ip ?? "unknown"}`, 20, 60 * 60_000)) throw new AppError("Too many attempts. Try again later.");
  await connectDB();
  const a = await Application.findOne({ statusTokenHash: hashToken(token) });
  if (!a) throw new NotFoundError("Application");
  let to: Stage;
  if (action === "withdraw") {
    if (!["new", "shortlisted", "interview", "offer"].includes(a.stage)) throw new AppError("This application can't be withdrawn now.");
    to = "withdrawn";
  } else {
    if (a.stage !== "offer") throw new AppError("There's no open offer to respond to.");
    if (a.offer?.expiresOn && a.offer.expiresOn < today(now)) throw new AppError("This offer has expired. Please contact the recruiter.");
    to = action === "accept" ? "accepted" : "declined";
    a.set("offer.respondedAt", now);
  }
  a.stage = to;
  a.history.push({ stage: to, at: now, byName: a.candidate.name, note: `Candidate ${action === "withdraw" ? "withdrew" : action + "ed the offer"}` });
  await a.save();
  await record({ id: null, name: `Applicant: ${a.candidate.name}`, ip }, {
    action: `recruitment.candidate.${action}`,
    entity: "application",
    entityId: String(a._id),
    summary: `${a.candidate.name} ${action === "withdraw" ? "withdrew their application" : `${action}ed the offer`} (${a.number})`,
  });
}

// ---------------------------------------------------------------------------
// Working an application (internal)
// ---------------------------------------------------------------------------

/**
 * The pipeline is a state machine: these are the only moves allowed.
 * (Offer, accept and hire have their own functions with their own checks.)
 */
const MOVES: Partial<Record<Stage, Stage[]>> = {
  new: ["shortlisted", "rejected"],
  shortlisted: ["rejected", "new"],
  interview: ["rejected"],
  offer: ["rejected"],
};

async function loadApp(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Application");
  await connectDB();
  const a = await Application.findById(id);
  if (!a) throw new NotFoundError("Application");
  const v = await Vacancy.findById(a.vacancyId).lean<VacDoc>();
  if (!v) throw new NotFoundError("Vacancy");
  return { a, v };
}

export async function getApplication(ctx: Ctx, id: string) {
  const { a, v } = await loadApp(id);
  const full = isRecruiter(ctx) || isHiringManager(ctx, v);
  const panelist = onPanel(ctx, a);
  if (!full && !panelist) throw new ForbiddenError();
  const app = a.toObject() as ApplicationDoc;

  // Interviewers can't see colleagues' scorecards until they've submitted their own,
  // so the first score heard doesn't anchor everyone else's.
  const me = ctx.employee?.id;
  const interviews = app.interviews.map((i) => {
    const mine = i.scorecards.find((s) => String(s.employeeId) === me);
    const onThisPanel = i.panel.some((p) => String(p.employeeId) === me);
    // On this panel: blind until you've scored, whoever you are (the hiring manager included).
    const seeAll = onThisPanel ? !!mine : full;
    return {
      id: String(i._id),
      at: i.at,
      durationMins: i.durationMins,
      mode: i.mode,
      where: i.where,
      panel: i.panel.map((p) => ({ id: String(p.employeeId), name: p.name, submitted: i.scorecards.some((s) => String(s.employeeId) === String(p.employeeId)) })),
      scorecards: seeAll ? i.scorecards : [],
      hiddenCount: seeAll ? 0 : i.scorecards.length,
      canScore: onThisPanel && !mine && has(ctx, "interview:score") && ["interview", "offer"].includes(app.stage),
      scheduledByName: i.scheduledByName,
    };
  });

  return {
    app,
    vacancy: v,
    full,
    interviews,
    questions: v.questions as Question[],
    canReview: has(ctx, "application:review") || has(ctx, "recruitment:manage"),
    canOffer: has(ctx, "recruitment:manage") && app.stage === "interview" && app.interviews.some((i) => i.scorecards.length > 0),
    canHire: has(ctx, "employee:create") && app.stage === "accepted",
    moves: full && (has(ctx, "application:review") || has(ctx, "recruitment:manage")) ? MOVES[app.stage as Stage] ?? [] : [],
  };
}

const MoveInput = z
  .object({ to: z.enum(["shortlisted", "rejected", "new"]), note: z.string().trim().max(300).default("") })
  .refine((v) => v.to !== "rejected" || v.note.length >= 3, { path: ["note"], message: "Give a reason for the record." });

export async function moveStage(ctx: Ctx, id: string, input: unknown, now = new Date()) {
  if (!has(ctx, "application:review") && !has(ctx, "recruitment:manage")) throw new ForbiddenError();
  const { to, note } = MoveInput.parse(input);
  const { a, v } = await loadApp(id);
  const from = a.stage as Stage;
  if (!(MOVES[from] ?? []).includes(to)) throw new AppError(`Can't move from ${from} to ${to}.`);
  a.stage = to;
  a.history.push({ stage: to, at: now, byName: ctx.name, note });
  await a.save();
  await record(ctx, {
    action: `recruitment.application.${to === "new" ? "unshortlist" : to}`,
    entity: "application",
    entityId: id,
    summary: `${to === "rejected" ? "Rejected" : to === "shortlisted" ? "Shortlisted" : "Moved back to new"}: ${a.candidate.name} for ${v.title} (${a.number})`,
    reason: note || undefined,
  });
}

const InterviewInput = z.object({
  at: z.string().min(1, "Choose a date and time.").pipe(z.coerce.date({ message: "Choose a date and time." })),
  durationMins: z.coerce.number().int().min(15).max(240).default(45),
  mode: z.enum(["in_person", "video", "phone"]),
  where: z.string().trim().min(2, "Say where (room, video link or phone).").max(200),
  panelIds: z.array(objectId).min(1, "Pick at least one interviewer.").max(5),
});

export async function scheduleInterview(ctx: Ctx, id: string, input: unknown, now = new Date()) {
  if (!has(ctx, "application:review") && !has(ctx, "recruitment:manage")) throw new ForbiddenError();
  const data = InterviewInput.parse(input);
  if (data.at <= now) throw new AppError("The interview must be in the future.");
  const { a, v } = await loadApp(id);
  if (!["shortlisted", "interview"].includes(a.stage)) throw new AppError("Shortlist the candidate before scheduling an interview.");

  // Every panellist must be a current employee whose login can score interviews.
  const panel = [];
  for (const pid of [...new Set(data.panelIds)]) {
    const [emp, user] = await Promise.all([
      Employee.findById(pid).lean<Stored>(),
      User.findOne({ employeeId: pid, status: "active" }).lean(),
    ]);
    if (!emp || emp.status === "separated" || !user) throw new AppError("Every interviewer must be a current employee with an account.");
    if (!can(await ctxForUser(user, null), "interview:score")) throw new AppError(`${emp.firstName} ${emp.lastName} isn't allowed to sit on interview panels.`);
    panel.push({ employeeId: emp._id, name: `${emp.firstName} ${emp.lastName}` });
  }
  a.interviews.push({ at: data.at, durationMins: data.durationMins, mode: data.mode, where: data.where, panel, scorecards: [], scheduledByName: ctx.name });
  if (a.stage === "shortlisted") {
    a.stage = "interview";
    a.history.push({ stage: "interview", at: now, byName: ctx.name, note: `Interview on ${data.at.toISOString().slice(0, 16).replace("T", " ")}` });
  }
  await a.save();
  await record(ctx, {
    action: "recruitment.interview.schedule",
    entity: "application",
    entityId: id,
    summary: `Scheduled an interview with ${a.candidate.name} for ${v.title}; panel: ${panel.map((p) => p.name).join(", ")}`,
  });
}

const ScorecardInput = z.object({
  interviewId: objectId,
  recommendation: z.enum(["strong_yes", "yes", "no", "strong_no"], { message: "Choose a recommendation." }),
  notes: z.string().trim().min(10, "Write a few words on why (at least 10 characters).").max(2000),
});

export async function submitScorecard(ctx: Ctx, id: string, input: Record<string, unknown>, now = new Date()) {
  authorize(ctx, "interview:score");
  const data = ScorecardInput.parse(input);
  const { a, v } = await loadApp(id);
  const interview = a.interviews.id(data.interviewId);
  if (!interview) throw new NotFoundError("Interview");
  if (!ctx.employee || !interview.panel.some((p) => String(p.employeeId) === ctx.employee!.id)) {
    throw new ForbiddenError("You're not on this interview panel.");
  }
  if (interview.scorecards.some((s) => String(s.employeeId) === ctx.employee!.id)) {
    throw new AppError("You've already submitted your scorecard. Scorecards can't be changed after submitting.");
  }
  const scores = v.criteria.map((criterion, i) => {
    const n = Number(input[`score_${i}`]);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new AppError(`Score "${criterion}" from 1 to 5.`);
    return { criterion, score: n };
  });
  interview.scorecards.push({
    employeeId: new Types.ObjectId(ctx.employee.id), name: ctx.name, scores, recommendation: data.recommendation, notes: data.notes, submittedAt: now,
  });
  await a.save();
  await record(ctx, {
    action: "recruitment.interview.score",
    entity: "application",
    entityId: id,
    summary: `Submitted an interview scorecard for ${a.candidate.name} (${v.title})`,
  });
}

const OfferInput = z.object({
  basicSalary: z.coerce.number().int().positive("Enter the monthly salary."),
  startDate: isoDate("Choose a start date."),
  expiresOn: isoDate("Choose when the offer expires."),
});

export async function makeOffer(ctx: Ctx, id: string, input: unknown, now = new Date()) {
  authorize(ctx, "recruitment:manage");
  const data = OfferInput.parse(input);
  const { a, v } = await loadApp(id);
  if (a.stage !== "interview") throw new AppError("Offers are made after an interview.");
  if (!a.interviews.some((i) => i.scorecards.length)) throw new AppError("Wait for at least one interview scorecard first.");
  const grade = GRADES.find((g) => g.code === v.grade)!;
  if (data.basicSalary < grade.min || data.basicSalary > grade.max) {
    throw new AppError(`The ${grade.code} band is KES ${grade.min.toLocaleString()}–${grade.max.toLocaleString()}. Offers must be inside it.`);
  }
  if (data.expiresOn < today(now)) throw new AppError("The offer would already have expired.");
  if (data.startDate <= data.expiresOn) throw new AppError("The start date should be after the offer expires.");
  a.offer = { ...data, madeByName: ctx.name, madeAt: now, respondedAt: undefined };
  a.stage = "offer";
  a.history.push({ stage: "offer", at: now, byName: ctx.name, note: `Offer: KES ${data.basicSalary.toLocaleString()} / month, start ${data.startDate}` });
  await a.save();
  await record(ctx, {
    action: "recruitment.offer.make",
    entity: "application",
    entityId: id,
    summary: `Made an offer to ${a.candidate.name} for ${v.title}`,
    changes: [{ field: "basicSalary", to: "[redacted]" }],
  });
}

/** Turn an accepted candidate into an employee: no retyping, and the offer's salary carries over. */
export async function hireCandidate(ctx: Ctx, id: string, input: Record<string, unknown>) {
  authorize(ctx, "employee:create");
  const { a, v } = await loadApp(id);
  if (a.stage !== "accepted") throw new AppError("Only candidates who accepted an offer can be hired.");

  const employeeId = await createEmployee(
    ctx,
    {
      ...input, // names, work email, gender and the PII HR collects at onboarding
      jobTitle: v.title,
      departmentId: String(v.departmentId),
      managerId: String(v.hiringManagerId),
      employmentType: v.employmentType,
      status: "probation",
      grade: v.grade,
      hireDate: a.offer!.startDate,
      phone: a.candidate.phone,
      personalEmail: a.candidate.email,
    },
    { approvedSalary: a.offer!.basicSalary!, source: `${a.number} (${v.title})` },
  );

  await withTransaction(async (session) => {
    a.stage = "hired";
    a.employeeId = new Types.ObjectId(employeeId);
    a.history.push({ stage: "hired", at: new Date(), byName: ctx.name, note: "Employee record created" });
    await a.save({ session });
    const vac = await Vacancy.findByIdAndUpdate(v._id, { $inc: { hired: 1 } }, { session, returnDocument: "after" });
    if (vac && vac.hired >= vac.openings) await Vacancy.updateOne({ _id: v._id }, { status: "filled" }, { session });
  });
  await record(ctx, {
    action: "recruitment.hire",
    entity: "application",
    entityId: id,
    summary: `Hired ${a.candidate.name} as ${v.title} from ${a.number}`,
  });
  return employeeId;
}

/** A CV for viewing: same access rule as the application, and every view is audited. */
export async function cvForViewing(ctx: Ctx, id: string) {
  const { a, v } = await loadApp(id);
  if (!isRecruiter(ctx) && !isHiringManager(ctx, v) && !onPanel(ctx, a)) throw new ForbiddenError();
  if (!a.cvFileId) throw new NotFoundError("CV");
  const bytes = await readCv(a.cvFileId);
  await record(ctx, {
    action: "recruitment.cv.view",
    entity: "application",
    entityId: id,
    summary: `Opened ${a.candidate.name}'s CV (${a.number})`,
  });
  return { bytes, filename: a.cvName || `${a.number}.pdf` };
}

/** The interviews this person sits on: what's coming up, and what still needs their scorecard. */
export async function myInterviews(ctx: Ctx) {
  if (!ctx.employee) return [];
  await connectDB();
  const me = new Types.ObjectId(ctx.employee.id);
  const apps = await Application.find({ "interviews.panel.employeeId": me, stage: { $in: ["interview", "offer", "accepted"] } }).lean<ApplicationDoc[]>();
  const vacancies = await Vacancy.find({ _id: { $in: apps.map((x) => x.vacancyId) } }).select("title").lean();
  const title = new Map(vacancies.map((x) => [String(x._id), x.title]));
  return apps
    .flatMap((app) =>
      app.interviews
        .filter((i) => i.panel.some((p) => String(p.employeeId) === ctx.employee!.id))
        .map((i) => ({
          applicationId: String(app._id),
          candidate: app.candidate.name,
          job: title.get(String(app.vacancyId)) ?? "",
          at: i.at,
          mode: i.mode,
          where: i.where,
          needsScorecard: !i.scorecards.some((s) => String(s.employeeId) === ctx.employee!.id),
        })),
    )
    .sort((x, y) => +x.at - +y.at);
}

/** Employees who may sit on an interview panel (for the scheduling form). */
export async function panelOptions() {
  await connectDB();
  const users = await User.find({ status: "active", employeeId: { $ne: null } }).lean();
  const out: { id: string; name: string }[] = [];
  for (const u of users) {
    if (can(await ctxForUser(u, null), "interview:score")) out.push({ id: String(u.employeeId), name: u.name });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}
