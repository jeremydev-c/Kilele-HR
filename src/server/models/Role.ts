import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";

const RoleSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "" },
    /** Grant strings from lib/permissions.ts, e.g. "leave:approve@team". */
    grants: { type: [String], default: [] },
    /** Seeded roles. System roles can't be deleted; "Super Admin" can't be edited at all. */
    system: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Role = defineModel<InferSchemaType<typeof RoleSchema>>("Role", RoleSchema);
