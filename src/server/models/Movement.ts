import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";
import { WorkflowSchema, type WorkflowState } from "../workflow";

/**
 * A promotion or demotion: proposed by a manager, approved by a senior
 * manager and HR (two different people), applied on the effective date.
 */

const JobSchema = new Schema(
  { jobTitle: String, grade: String, basicSalary: Number },
  { _id: false },
);

const MovementSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // MV-2026-0001
    kind: { type: String, enum: ["promotion", "demotion"], required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    employeeName: { type: String, required: true },
    from: { type: JobSchema, required: true },
    to: { type: JobSchema, required: true },
    /** true if the salary was set by someone with pay rights; false = moved into the new band automatically. */
    salaryChosen: { type: Boolean, default: false },
    effectiveDate: { type: String, required: true }, // ISO date
    justification: { type: String, required: true },
    /** Set when the change is written to the employee record (on or after the effective date). */
    appliedAt: { type: Date, default: null },
    workflow: { type: WorkflowSchema, required: true },
  },
  { timestamps: true },
);

export type MovementRecord = Omit<InferSchemaType<typeof MovementSchema>, "workflow"> & { workflow: WorkflowState };
export const Movement = defineModel<MovementRecord>("Movement", MovementSchema);
