import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";

/**
 * A message from HR or a manager to a group of people: shown on their
 * Announcements page and emailed to each of them. A meeting also has a time
 * and a place. Recipients are fixed when it's sent (people who join later
 * don't suddenly receive old news).
 */
const AnnouncementSchema = new Schema(
  {
    kind: { type: String, enum: ["announcement", "meeting"], required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    meeting: {
      type: new Schema({ at: { type: Date, required: true }, durationMins: { type: Number, required: true }, where: { type: String, required: true } }, { _id: false }),
      default: null,
    },
    /** How the sender chose people, in words: "Everyone", "Engineering, Finance", "4 people". */
    audienceLabel: { type: String, required: true },
    recipientIds: { type: [Schema.Types.ObjectId], ref: "Employee", default: [] },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
    authorUserId: { type: String, required: true },
    authorEmployeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    authorName: { type: String, required: true },
  },
  { timestamps: true },
);
AnnouncementSchema.index({ recipientIds: 1, createdAt: -1 });
AnnouncementSchema.index({ authorUserId: 1, createdAt: -1 });

export type AnnouncementRecord = InferSchemaType<typeof AnnouncementSchema>;
export const Announcement = defineModel<AnnouncementRecord>("Announcement", AnnouncementSchema);
