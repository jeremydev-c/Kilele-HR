import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * One employee. Fields are grouped by sensitivity class (see docs/DESIGN.md §4):
 *   directory  - top level: anyone with employee:read in scope
 *   contact    - employee.contact:read
 *   pii        - employee.pii:read; every value encrypted with AES-256-GCM (lib/crypto.ts)
 *   pay        - employee.pay:read
 */

const PersonSchema = new Schema(
  { name: String, relationship: String, phone: String },
  { _id: false },
);

const EmployeeSchema = new Schema(
  {
    staffNo: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    otherNames: { type: String, default: "", trim: true },
    gender: { type: String, enum: ["female", "male"], required: true },
    workEmail: { type: String, required: true, unique: true, lowercase: true, trim: true },
    jobTitle: { type: String, required: true },
    grade: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", required: true },
    managerId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    /**
     * Materialised path: every manager above this person, top first.
     * "Is X in my team?" is then one indexed query: { managerPath: myId }.
     */
    managerPath: { type: [Schema.Types.ObjectId], default: [], index: true },
    employmentType: { type: String, enum: ["permanent", "contract", "intern"], default: "permanent" },
    status: { type: String, enum: ["probation", "active", "on_leave", "separated"], default: "active" },
    hireDate: { type: Date, required: true },
    separationDate: { type: Date, default: null },
    /** 60th birthday, stored in clear so upcoming retirements can be listed without decrypting dates of birth. */
    retirementDate: { type: Date, default: null },

    contact: {
      personalEmail: String,
      phone: String,
      address: String,
      town: String,
      county: String,
      nextOfKin: PersonSchema,
      emergencyContact: PersonSchema,
    },

    // All encrypted at rest (enc:v1:...).
    pii: {
      nationalId: String,
      kraPin: String,
      nssfNo: String,
      shaNo: String,
      dateOfBirth: String,
      bankName: String,
      bankBranch: String,
      bankAccount: String,
    },
    /** HMAC of the National ID: uniqueness and exact search without decrypting. */
    nationalIdHash: { type: String, unique: true, sparse: true },

    pay: {
      basicSalary: { type: Number, default: 0 },
      currency: { type: String, default: "KES" },
    },
  },
  { timestamps: true },
);

EmployeeSchema.index({ departmentId: 1, status: 1 });
EmployeeSchema.index({ lastName: 1, firstName: 1 });

export type EmployeeRecord = InferSchemaType<typeof EmployeeSchema>;

export const Employee =
  (models.Employee as Model<EmployeeRecord>) || model("Employee", EmployeeSchema);
