import { Schema, type InferSchemaType, type Types } from "mongoose";
import { defineModel } from "./define";
import { WorkflowSchema, type WorkflowState } from "../workflow";

/**
 * Recruitment: requisition (approved headcount) → vacancy (the advert) →
 * applications → interviews → offer → hire.
 */

// ---------------------------------------------------------------------------
// Requisition: "I need to hire". Goes through the shared approval engine.
// ---------------------------------------------------------------------------

const RequisitionSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // REQ-2026-0001
    title: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    grade: { type: String, required: true },
    employmentType: { type: String, enum: ["permanent", "contract", "intern"], default: "permanent" },
    openings: { type: Number, default: 1, min: 1 },
    justification: { type: String, required: true },
    hiringManagerId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    hiringManagerName: { type: String, required: true },
    /** Set when this hire replaces someone who is leaving (so we stop suggesting it). */
    replacesEmployeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    replacesName: { type: String, default: null },
    vacancyId: { type: Schema.Types.ObjectId, ref: "Vacancy", default: null },
    workflow: { type: WorkflowSchema, required: true },
  },
  { timestamps: true },
);

export type RequisitionRecord = Omit<InferSchemaType<typeof RequisitionSchema>, "workflow"> & { workflow: WorkflowState };
export const Requisition = defineModel<RequisitionRecord>("Requisition", RequisitionSchema);

// ---------------------------------------------------------------------------
// Vacancy: the public job advert, with screening questions
// ---------------------------------------------------------------------------

/**
 * A screening question. Answers are scored automatically:
 *   yesno   "yes" scores full marks. knockout: a "no" fails the minimum requirement.
 *   number  scores value / target (capped at 1). knockoutBelow fails anything lower.
 * weight 0 = for information only (e.g. salary expectation).
 */
const QuestionSchema = new Schema(
  {
    key: { type: String, required: true },
    text: { type: String, required: true },
    kind: { type: String, enum: ["yesno", "number"], required: true },
    weight: { type: Number, default: 1 },
    knockout: { type: Boolean, default: false },
    target: { type: Number, default: null },
    knockoutBelow: { type: Number, default: null },
  },
  { _id: false },
);

const VacancySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    requisitionId: { type: Schema.Types.ObjectId, ref: "Requisition", required: true },
    title: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    departmentName: { type: String, required: true },
    grade: { type: String, required: true },
    employmentType: { type: String, required: true },
    location: { type: String, default: "Nairobi" },
    openings: { type: Number, default: 1 },
    showSalary: { type: Boolean, default: true },
    summary: { type: String, required: true },
    responsibilities: { type: String, default: "" },
    requirements: { type: String, default: "" },
    closesOn: { type: String, required: true }, // ISO date, inclusive
    status: { type: String, enum: ["draft", "open", "closed", "filled"], default: "draft" },
    questions: { type: [QuestionSchema], default: [] },
    /** What interviewers score, 1–5 each. */
    criteria: { type: [String], default: ["Technical skills", "Problem solving", "Communication", "Team fit"] },
    hiringManagerId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    hired: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
VacancySchema.index({ status: 1, closesOn: 1 });

export type VacancyRecord = InferSchemaType<typeof VacancySchema>;
export const Vacancy = defineModel<VacancyRecord>("Vacancy", VacancySchema);

// ---------------------------------------------------------------------------
// Application: one candidate for one vacancy, with interviews embedded
// ---------------------------------------------------------------------------

export const STAGES = ["new", "shortlisted", "interview", "offer", "accepted", "hired", "rejected", "withdrawn", "declined"] as const;
export type Stage = (typeof STAGES)[number];

const ScorecardSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    name: { type: String, required: true },
    scores: { type: [{ criterion: String, score: Number, _id: false }], default: [] },
    recommendation: { type: String, enum: ["strong_yes", "yes", "no", "strong_no"], required: true },
    notes: { type: String, default: "" },
    submittedAt: { type: Date, required: true },
  },
  { _id: false },
);

const InterviewSchema = new Schema({
  at: { type: Date, required: true },
  durationMins: { type: Number, default: 45 },
  mode: { type: String, enum: ["in_person", "video", "phone"], default: "in_person" },
  where: { type: String, default: "" }, // room or video link
  panel: { type: [{ employeeId: { type: Schema.Types.ObjectId, ref: "Employee" }, name: String, _id: false }], default: [] },
  scorecards: { type: [ScorecardSchema], default: [] },
  scheduledByName: { type: String, required: true },
});

const ApplicationSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // APP-2026-0001
    vacancyId: { type: Schema.Types.ObjectId, ref: "Vacancy", required: true, index: true },
    candidate: {
      type: new Schema(
        {
          name: { type: String, required: true },
          email: { type: String, required: true, lowercase: true },
          phone: { type: String, required: true },
          location: { type: String, default: "" },
        },
        { _id: false },
      ),
      required: true,
    },
    coverLetter: { type: String, default: "" },
    answers: { type: [{ key: String, value: String, _id: false }], default: [] },
    /** 0–100 from the screening questions. */
    score: { type: Number, default: 0 },
    knockouts: { type: [String], default: [] },
    cvFileId: { type: Schema.Types.ObjectId, default: null },
    cvName: { type: String, default: "" },
    stage: { type: String, enum: STAGES, default: "new", index: true },
    history: {
      type: [{ stage: String, at: Date, byName: String, note: String, _id: false }],
      default: [],
    },
    interviews: { type: [InterviewSchema], default: [] },
    offer: {
      basicSalary: Number,
      startDate: String,
      expiresOn: String,
      madeByName: String,
      madeAt: Date,
      respondedAt: Date,
    },
    /** Candidate's private status link: we store only a hash of the token. */
    statusTokenHash: { type: String, required: true, unique: true },
    consentAt: { type: Date, required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true },
);
ApplicationSchema.index({ vacancyId: 1, "candidate.email": 1 }, { unique: true });
ApplicationSchema.index({ "interviews.panel.employeeId": 1 });

export type ApplicationRecord = InferSchemaType<typeof ApplicationSchema>;
export type ApplicationDoc = ApplicationRecord & { _id: Types.ObjectId };
export const Application = defineModel<ApplicationRecord>("Application", ApplicationSchema);
