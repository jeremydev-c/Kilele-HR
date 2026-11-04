import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * One step in someone's career: hired, promoted, moved department, salary
 * changed, separated... Nothing is overwritten: the employee record holds
 * the current snapshot, and these events are the full history behind it.
 */

const SnapshotSchema = new Schema(
  {
    jobTitle: String,
    grade: String,
    departmentId: { type: Schema.Types.ObjectId, ref: "Department" },
    departmentName: String,
    managerName: String,
    /** Pay: only shown to people with employee.pay:read on this employee. */
    basicSalary: Number,
    status: String,
  },
  { _id: false },
);

const EmploymentEventSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    type: {
      type: String,
      enum: ["hire", "promotion", "demotion", "transfer", "manager_change", "salary_change", "status_change", "separation"],
      required: true,
    },
    effectiveDate: { type: Date, required: true },
    summary: { type: String, required: true },
    from: { type: SnapshotSchema, default: null },
    to: { type: SnapshotSchema, default: null },
    actorName: { type: String, required: true },
    /** The approved request behind this event, e.g. a promotion request (M4). */
    requestId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

EmploymentEventSchema.index({ employeeId: 1, effectiveDate: -1 });

export type EmploymentEventRecord = InferSchemaType<typeof EmploymentEventSchema>;

export const EmploymentEvent =
  (models.EmploymentEvent as Model<EmploymentEventRecord>) || model("EmploymentEvent", EmploymentEventSchema);
