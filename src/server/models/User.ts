import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    roleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    /** Grants given to this one user on top of their roles, e.g. "audit:read". */
    extraGrants: { type: [String], default: [] },
    /** The employee this login belongs to. Optional: e.g. an external auditor has none. */
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    /** Bumped to sign the user out everywhere: older session cookies stop working. */
    sessionVersion: { type: Number, default: 0 },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Schema.Types.ObjectId };

export const User = defineModel<InferSchemaType<typeof UserSchema>>("User", UserSchema);
