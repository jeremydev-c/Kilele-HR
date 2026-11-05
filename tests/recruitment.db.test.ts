/**
 * Recruitment against the seeded database: the public form's defences, the
 * pipeline rules, hidden scorecards, offers and hire → employee.
 * Needs `npm run db`. Runs on its own kilele_hr_test database (seeded by `npm run test:db`), so the demo data is never touched.
 */
import "./testDbSetup";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { Application, Requisition, Vacancy } from "@/server/models/Recruitment";
import { ctxForUser, type Ctx } from "@/server/context";
import {
  advertDraft, candidateStatus, createRequisition, getApplication, hireCandidate, hiringSuggestions, makeOffer, moveStage, openVacancies, publicVacancy, readyToAdvertise,
  submitApplication, submitScorecard,
} from "@/server/services/recruitment";
import { AppError, ForbiddenError, NotFoundError } from "@/server/errors";
import { blindIndex } from "@/lib/crypto";
import { decide } from "@/server/services/approvals";
import { demoCvPdf } from "../scripts/demoPdf";

const NOW = new Date("2026-11-04T09:00:00+03:00");
const as = async (first: string): Promise<Ctx> => {
  const e = await Employee.findOne({ firstName: first }).lean();
  return ctxForUser((await User.findOne({ employeeId: e!._id }).lean())!, "test");
};
const appOf = async (name: string) => String((await Application.findOne({ "candidate.name": name }).lean())!._id);
const pdf = { bytes: demoCvPdf("Test Person", ["Line"]), name: "cv.pdf" };
let slug = "";
let n = 0;
const applicant = (extra: Record<string, string> = {}) => ({
  name: "Test Person", email: `test${++n}@example.com`, phone: "0712345678", consent: "on",
  answer_q1: "yes", answer_q2: "4", answer_q3: "yes", answer_q4: "100000", ...extra,
});

before(async () => {
  await connectDB();
  slug = (await Vacancy.findOne({ title: "Senior Frontend Engineer" }).lean())!.slug;
});
after(() => mongoose.disconnect());

test("public form: PDF only, one application per email, honeypot, consent", async () => {
  const notPdf = { bytes: new TextEncoder().encode("MZ fake.exe"), name: "cv.pdf" };
  await assert.rejects(submitApplication(slug, applicant(), notPdf, "t1", NOW), /must be a PDF/, "checked by content, not file name");
  await assert.rejects(submitApplication(slug, applicant({ website: "http://spam" }), pdf, "t1", NOW), AppError, "honeypot");
  await assert.rejects(submitApplication(slug, applicant({ consent: "" }), pdf, "t1", NOW), "consent required");
  const dup = applicant({ email: "achieng.odhiambo@example.com" });
  await assert.rejects(submitApplication(slug, dup, pdf, "t1", NOW), /already applied/);
});

test("the candidate's status page shows no scores, notes or interviewers", async () => {
  const { token } = await submitApplication(slug, applicant(), pdf, "t2", NOW);
  const s = await candidateStatus(token);
  const json = JSON.stringify(s);
  for (const leak of ["score", "knockout", "scorecard", "panel", "statusTokenHash"]) assert.ok(!json.includes(leak), `no ${leak}`);
  assert.equal(s.label, "Received");
});

test("the pipeline only allows defined moves", async () => {
  const faith = await as("Faith");
  const achieng = await appOf("Achieng Odhiambo"); // accepted an offer
  await assert.rejects(moveStage(faith, achieng, { to: "shortlisted" }), /Can't move/);
  await assert.rejects(moveStage(faith, await appOf("Otieno Ouma"), { to: "rejected", note: "" }), "rejecting needs a reason");
  await assert.rejects(moveStage(await as("Mercy"), await appOf("Otieno Ouma"), { to: "shortlisted" }), ForbiddenError);
});

test("interviewers can't see colleagues' scores until they submit their own", async () => {
  const kip = await appOf("Kipchirchir Langat");
  const david = await as("David");
  let view = await getApplication(david, kip);
  assert.equal(view.interviews[0].scorecards.length, 0);
  assert.equal(view.interviews[0].hiddenCount, 1, "Collins has scored");
  assert.equal(view.interviews[0].canScore, true);

  const scores = { score_0: "4", score_1: "4", score_2: "5", score_3: "4" };
  await submitScorecard(david, kip, { interviewId: view.interviews[0].id, recommendation: "yes", notes: "Good fundamentals, clear communicator.", ...scores });
  view = await getApplication(david, kip);
  assert.equal(view.interviews[0].scorecards.length, 2, "now he sees both");
  await assert.rejects(
    submitScorecard(david, kip, { interviewId: view.interviews[0].id, recommendation: "no", notes: "Changed my mind after seeing Collins'.", ...scores }),
    /can't be changed/,
  );
  await assert.rejects(getApplication(await as("Mercy"), kip), ForbiddenError, "not on the panel, not a recruiter");
});

test("offers must sit inside the grade's salary band", async () => {
  const kip = await appOf("Kipchirchir Langat");
  await assert.rejects(makeOffer(await as("Faith"), kip, { basicSalary: "400000", expiresOn: "2026-12-30", startDate: "2027-01-11" }), /band/);
});

test("requisitions: managers request for their own department only", async () => {
  const eng = String((await Employee.findOne({ firstName: "David" }).lean())!.departmentId);
  await assert.rejects(
    createRequisition(await as("Esther"), { title: "Data Engineer", departmentId: eng, grade: "G4", employmentType: "permanent", openings: 1, justification: "We need more data people to build reports." }),
    ForbiddenError,
  );
});

test("hire: the accepted candidate becomes an employee, nothing retyped", async () => {
  // Kevin (HR Officer) has no pay rights, but the salary comes from the accepted offer.
  const id = await appOf("Achieng Odhiambo");
  const employeeId = await hireCandidate(await as("Kevin"), id, {
    firstName: "Achieng", lastName: "Odhiambo", gender: "female", workEmail: "achieng.odhiambo@kilele.co.ke",
    // Typed the way people do: spaces and dashes are fine.
    nationalId: "3123 4567", kraPin: "a012-345678b", nssfNo: "2001 4455 66", shaNo: "", dateOfBirth: "1995-03-14", bankAccount: "",
  });
  const e = (await Employee.findById(employeeId).lean())!;
  const david = (await Employee.findOne({ firstName: "David" }).lean())!;
  assert.equal(e.jobTitle, "Senior Frontend Engineer");
  assert.equal(e.grade, "G4");
  assert.equal(e.pay?.basicSalary, 165000);
  assert.equal(String(e.managerId), String(david._id));
  assert.equal(e.status, "probation");
  assert.equal(e.contact?.personalEmail, "achieng.odhiambo@example.com");
  assert.equal(e.nationalIdHash, blindIndex("31234567"), "stored without the space, so ID search finds her");

  const vac = (await Vacancy.findOne({ slug }).lean())!;
  assert.equal(vac.status, "filled", "1 of 1 hired");
  // Filled means gone from the public site at once: not listed, no job page, no new applications.
  assert.ok(!(await openVacancies(NOW)).some((v) => v.slug === slug), "off the website's job list");
  await assert.rejects(publicVacancy(slug, NOW), NotFoundError, "its job page is gone");
  await assert.rejects(hireCandidate(await as("Kevin"), id, {}), /accepted an offer/, "can't hire twice");
});

test("hiring suggestions: leavers in your area, retirements only with PII access, gone once a replacement is requested", async () => {
  const names = async (first: string) => (await hiringSuggestions(await as(first), NOW)).map((s) => s.name);

  const joseph = await names("Joseph"); // Operations manager, no PII access
  assert.ok(joseph.includes("Patrick Mwenda"), "his leaver");
  assert.ok(!joseph.includes("John Maina"), "retirement dates reveal age: not for him");
  assert.ok(!(await names("David")).includes("Patrick Mwenda"), "not another department's leaver");

  const grace = await names("Grace"); // HR: every department, with PII
  assert.ok(grace.includes("John Maina"), "turns 60 within 6 months");
  assert.ok(!grace.includes("Francis Njoroge"), "already covered by Esther's request");

  const patrick = (await Employee.findOne({ firstName: "Patrick" }).lean())!;
  const replacement = await createRequisition(await as("Joseph"), {
    title: patrick.jobTitle, departmentId: String(patrick.departmentId), grade: patrick.grade, employmentType: "permanent", openings: 1,
    justification: "Replacement for Patrick, who has resigned.", replacesEmployeeId: String(patrick._id),
  }, NOW);
  assert.ok(!(await names("Joseph")).includes("Patrick Mwenda"), "no repeat nag once requested");
  // Declined means "we won't replace": it still doesn't come back.
  await decide(await as("Grace"), "requisition", replacement, { decision: "reject", comment: "Logistics work moves to the new partner." }, NOW);
  assert.ok(!(await names("Joseph")).includes("Patrick Mwenda"), "not suggested again after a decline");
});

test("approved hires are ready to advertise, with the advert pre-filled", async () => {
  // A brand-new job (no earlier advert): built from the Finance template.
  const accounts = (await Requisition.findOne({ title: "Accounts Assistant" }).lean())!;
  await decide(await as("Grace"), "requisition", String(accounts._id), { decision: "approve" }, NOW);
  const faith = await as("Faith");
  assert.ok((await readyToAdvertise(faith)).some((r) => r.title === "Accounts Assistant"));
  const fresh = await advertDraft(faith, String(accounts._id), NOW);
  assert.match(fresh.source, /Pre-filled for a Finance role/);
  assert.match(fresh.summary, /entry-level Accounts Assistant/);

  // A job we've advertised before: the last advert is copied, questions and all.
  const repeat = await createRequisition(await as("Lucy"), {
    title: "Sales Executive", departmentId: String((await Employee.findOne({ firstName: "Lucy" }).lean())!.departmentId),
    grade: "G3", employmentType: "permanent", openings: 1, justification: "A third territory opens in Nakuru next quarter.",
  }, NOW);
  await decide(await as("Grace"), "requisition", repeat, { decision: "approve" }, NOW);
  const copied = await advertDraft(faith, repeat, NOW);
  assert.match(copied.source, /Copied from the last Sales Executive advert/);
  assert.ok(copied.questions.some((q) => q.text.includes("driving licence")));
  assert.equal(copied.closesOn > "2026-11-04", true, "a fresh closing date, not the old one");

  // Recruiters only: a line manager can't open the draft.
  await assert.rejects(advertDraft(await as("David"), repeat, NOW), ForbiddenError);
});
