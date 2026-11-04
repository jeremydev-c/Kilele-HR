import { Schema, model, models, type ClientSession, type Model } from "mongoose";

/** Gap-free sequence numbers (staff numbers, request numbers), handed out atomically. */
const CounterSchema = new Schema({
  _id: { type: String, required: true },
  value: { type: Number, default: 0 },
});

export const Counter =
  (models.Counter as Model<{ _id: string; value: number }>) || model("Counter", CounterSchema);

export async function nextNumber(name: string, session?: ClientSession): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", session },
  ).lean();
  return doc!.value;
}
