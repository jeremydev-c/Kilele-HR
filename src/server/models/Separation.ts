import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";
import { WorkflowSchema, type WorkflowState } from "../workflow";

/**
 * Someone leaving: resignation, retirement, termination or end of contract.
 *   approval (manager → HR) → clearance (each department signs off)
 *   → exit interview → on the last day: record closed, login disabled.
 */

const ClearanceItemSchema = new Schema({
  departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
  departmentName: { type: String, required: true },
  item: { type: String, required: true },
  signedById: { type: String, default: null },
  signedByName: { type: String, default: null },
  signedAt: { type: Date, default: null },
  note: { type: String, default: "" },
});

const SeparationSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // SEP-2026-0001
    kind: { type: String, enum: ["resignation", "retirement", "termination", "end_of_contract"], required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    employeeName: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    lastDay: { type: String, required: true }, // ISO date
    reason: { type: String, required: true },
    /** Created when the separation is approved. */
    clearance: { type: [ClearanceItemSchema], default: [] },
    /** The leaver's answers. Seen by HR only, not their manager, so people can be honest. */
    exitInterview: {
      type: new Schema(
        {
          reason: String,
          ratings: { type: [{ topic: String, score: Number, _id: false }], default: [] },
          wouldRecommend: Boolean,
          comments: String,
          submittedAt: Date,
        },
        { _id: false },
      ),
      default: null,
    },
    /** Set when the employee record is closed and the login disabled. */
    completedAt: { type: Date, default: null },
    workflow: { type: WorkflowSchema, required: true },
  },
  { timestamps: true },
);
SeparationSchema.index({ "clearance.departmentId": 1, completedAt: 1 });

export type SeparationRecord = Omit<InferSchemaType<typeof SeparationSchema>, "workflow"> & { workflow: WorkflowState };
export const Separation = defineModel<SeparationRecord>("Separation", SeparationSchema);
