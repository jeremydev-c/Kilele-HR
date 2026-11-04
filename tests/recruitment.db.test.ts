/**
 * Recruitment against the seeded database: the public form's defences, the
 * pipeline rules, hidden scorecards, offers and hire → employee.
 * Needs `npm run db` + `npm run seed:test` (pins the demo to the week of 4 Nov 2026). Changes data: run `npm run seed` afterwards.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/server/models/User";
import { Employee } from "@/server/models/Employee";
import { Application, Vacancy } from "@/server/models/Recruitment";
import { ctxForUser, type Ctx } from "@/server/context";
import {
  candidateStatus, createRequisition, getApplication, hireCandidate, makeOffer, moveStage, submitApplication, submitScorecard,
} from "@/server/services/recruitment";
import { AppError, ForbiddenError } from "@/server/errors";
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
    nationalId: "31234567", kraPin: "A012345678B", nssfNo: "", shaNo: "", dateOfBirth: "1995-03-14", bankAccount: "",
  });
  const e = (await Employee.findById(employeeId).lean())!;
  const david = (await Employee.findOne({ firstName: "David" }).lean())!;
  assert.equal(e.jobTitle, "Senior Frontend Engineer");
  assert.equal(e.grade, "G4");
  assert.equal(e.pay?.basicSalary, 165000);
  assert.equal(String(e.managerId), String(david._id));
  assert.equal(e.status, "probation");
  assert.equal(e.contact?.personalEmail, "achieng.odhiambo@example.com");

  const vac = (await Vacancy.findOne({ slug }).lean())!;
  assert.equal(vac.status, "filled", "1 of 1 hired");
  await assert.rejects(hireCandidate(await as("Kevin"), id, {}), /accepted an offer/, "can't hire twice");
});
