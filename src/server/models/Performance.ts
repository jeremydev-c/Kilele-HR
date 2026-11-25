import { Schema, type InferSchemaType, type Types } from "mongoose";
import { defineModel } from "./define";

/**
 * Performance reviews.
 *
 *   HR starts a cycle ("2026 Annual review") → one review per employee who has a manager
 *   goals        the manager sets 2–8 goals, weights adding up to 100
 *   self         the employee rates each goal 1–5 and comments
 *   manager      the manager rates each goal 1–5; overall = weighted average
 *   acknowledge  the employee reads it and agrees, or disagrees with a comment
 *   done
 *
 * Closing the cycle freezes every review in it, wherever it got to.
 */

export const REVIEW_STAGES = ["goals", "self", "manager", "acknowledge", "done"] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];

const CycleSchema = new Schema(
  {
    name: { type: String, required: true },
    periodStart: { type: String, required: true }, // ISO date
    periodEnd: { type: String, required: true },
    dueOn: { type: String, required: true },
    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
    startedByName: { type: String, required: true },
    closedAt: { type: Date, default: null },
    closedByName: { type: String, default: null },
    /** People left out because nobody manages them (e.g. the CEO). Shown to HR. */
    skipped: { type: [{ employeeId: Schema.Types.ObjectId, name: String, reason: String, _id: false }], default: [] },
  },
  { timestamps: true },
);

export type CycleRecord = InferSchemaType<typeof CycleSchema>;
export type CycleDoc = CycleRecord & { _id: Types.ObjectId };
export const ReviewCycle = defineModel<CycleRecord>("ReviewCycle", CycleSchema);

const GoalSchema = new Schema(
  {
    title: { type: String, required: true },
    /** How success is judged, e.g. "95% of tickets closed within 2 days". */
    measure: { type: String, default: "" },
    weight: { type: Number, required: true, min: 5, max: 100 },
    selfRating: { type: Number, default: null, min: 1, max: 5 },
    selfComment: { type: String, default: "" },
    managerRating: { type: Number, default: null, min: 1, max: 5 },
    managerComment: { type: String, default: "" },
  },
  { _id: false },
);

const ReviewSchema = new Schema(
  {
    cycleId: { type: Schema.Types.ObjectId, ref: "ReviewCycle", required: true, index: true },
    cycleName: { type: String, required: true },
    dueOn: { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    employeeName: { type: String, required: true },
    jobTitle: { type: String, required: true },
    /** Copies of the employee's place in the organisation, so scoped access is one query (as on leave requests). */
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    managerPath: { type: [Schema.Types.ObjectId], default: [], index: true },
    /** Their manager when the cycle started. Stays the reviewer for this cycle. */
    reviewerId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    reviewerName: { type: String, required: true },
    stage: { type: String, enum: REVIEW_STAGES, default: "goals", index: true },
    goals: { type: [GoalSchema], default: [] },
    selfSummary: { type: String, default: "" },
    managerSummary: { type: String, default: "" },
    /** Weighted average of the manager's ratings, 1.0–5.0. */
    overall: { type: Number, default: null },
    acknowledgement: {
      type: new Schema({ agreed: Boolean, comment: String, at: Date }, { _id: false }),
      default: null,
    },
    /** Frozen when HR closed the cycle before this review finished. */
    closedEarly: { type: Boolean, default: false },
    history: { type: [{ stage: String, at: Date, byName: String, note: String, _id: false }], default: [] },
  },
  { timestamps: true },
);
ReviewSchema.index({ cycleId: 1, employeeId: 1 }, { unique: true });

export type ReviewRecord = InferSchemaType<typeof ReviewSchema>;
export type ReviewDoc = ReviewRecord & { _id: Types.ObjectId };
export const Review = defineModel<ReviewRecord>("Review", ReviewSchema);
