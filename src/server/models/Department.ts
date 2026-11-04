import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const DepartmentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    headId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

export const Department =
  (models.Department as Model<InferSchemaType<typeof DepartmentSchema>>) || model("Department", DepartmentSchema);
