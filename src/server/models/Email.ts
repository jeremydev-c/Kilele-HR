import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";

/**
 * Every email the system writes, whether or not it was delivered: the
 * outbox HR can open on the Emails page. Saved before sending, so a failed
 * or switched-off email service never loses a message.
 */
const EmailSchema = new Schema(
  {
    to: { type: String, required: true, lowercase: true, trim: true },
    toName: { type: String, default: "" },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String, required: true },
    /** What it's about, e.g. "application.received", "approval.needed". */
    kind: { type: String, required: true },
    entity: { type: String, default: null },
    entityId: { type: String, default: null },
    /** sent: Resend accepted it · failed: Resend refused it · skipped: made-up demo address · saved: no email service on. */
    status: { type: String, enum: ["sent", "failed", "skipped", "saved"], required: true },
    reason: { type: String, default: "" },
    providerId: { type: String, default: null },
  },
  { timestamps: true },
);
EmailSchema.index({ createdAt: -1 });
EmailSchema.index({ entity: 1, entityId: 1 });

export type EmailRecord = InferSchemaType<typeof EmailSchema>;
export const Email = defineModel<EmailRecord>("Email", EmailSchema);
