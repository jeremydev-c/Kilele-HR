import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";

const DepartmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    headId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

export const Department =
  defineModel<InferSchemaType<typeof DepartmentSchema>>("Department", DepartmentSchema);
