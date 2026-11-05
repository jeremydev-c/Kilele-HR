import { Schema, type InferSchemaType } from "mongoose";
import { defineModel } from "./define";

/**
 * Append-only, hash-chained audit trail (see server/audit.ts).
 * hash = SHA-256(prevHash + this entry's contents), so editing or deleting
 * any entry breaks the chain from that point on.
 */
const AuditLogSchema = new Schema({
  /** 1, 2, 3...; unique, so two simultaneous writes can't both claim the same place in the chain. */
  seq: { type: Number, required: true, unique: true },
  at: { type: Date, required: true },
  actorId: { type: String, default: null },
  actorName: { type: String, required: true },
  /** e.g. "auth.login", "user.create", "role.update", "employee.pii.reveal" */
  action: { type: String, required: true, index: true },
  entity: { type: String, default: null },
  entityId: { type: String, default: null, index: true },
  summary: { type: String, required: true },
  /** Field names always; values only for non-sensitive fields. */
  changes: {
    type: [{ field: String, from: String, to: String, _id: false }],
    default: [],
  },
  reason: { type: String, default: null },
  ip: { type: String, default: null },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
});

export type AuditEntry = InferSchemaType<typeof AuditLogSchema>;

export const AuditLog = defineModel<AuditEntry>("AuditLog", AuditLogSchema);
