import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db";
import { AuditLog, type AuditEntry } from "./models/AuditLog";
import type { Ctx } from "./context";

/**
 * The audit trail. Every write, and every view of PII, calls record().
 *
 * Tamper-evident: each entry's hash covers the previous entry's hash, like
 * a blockchain without the mining. Editing or deleting an old entry in the
 * database breaks the chain, and verifyChain() shows exactly where.
 */

const GENESIS = "0".repeat(64);

export type Actor = { id: string | null; name: string; ip: string | null };

export const SYSTEM: Actor = { id: null, name: "System", ip: null };

export function actorOf(ctx: Ctx): Actor {
  return { id: ctx.userId, name: ctx.name, ip: ctx.ip };
}

export type Change = { field: string; from?: string; to?: string };

export type AuditInput = {
  action: string;
  entity?: string;
  entityId?: string;
  summary: string;
  changes?: Change[];
  reason?: string;
};

type Hashable = Pick<
  AuditEntry,
  "seq" | "at" | "actorId" | "actorName" | "action" | "entity" | "entityId" | "summary" | "changes" | "reason" | "ip"
>;

/** Fixed field order, so the same entry always hashes the same way. */
function hashEntry(prevHash: string, e: Hashable): string {
  const canonical = JSON.stringify([
    e.seq,
    new Date(e.at).toISOString(),
    e.actorId ?? null,
    e.actorName,
    e.action,
    e.entity ?? null,
    e.entityId ?? null,
    e.summary,
    (e.changes ?? []).map((c) => [c.field, c.from ?? null, c.to ?? null]),
    e.reason ?? null,
    e.ip ?? null,
  ]);
  return createHash("sha256").update(prevHash).update(canonical).digest("hex");
}

export async function record(actor: Actor | Ctx, input: AuditInput): Promise<void> {
  await connectDB();
  const a: Actor = "userId" in actor ? actorOf(actor) : actor;

  // The unique index on seq makes concurrent writers take turns: if another
  // request claimed this seq first, re-read the head of the chain and retry.
  for (let attempt = 0; attempt < 8; attempt++) {
    const last = await AuditLog.findOne().sort({ seq: -1 }).select("seq hash").lean();
    const entry: Hashable = {
      seq: (last?.seq ?? 0) + 1,
      at: new Date(),
      actorId: a.id,
      actorName: a.name,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary,
      changes: (input.changes ?? []).map((c) => ({ field: c.field, from: c.from ?? null, to: c.to ?? null })),
      reason: input.reason ?? null,
      ip: a.ip,
    } as Hashable;
    const prevHash = last?.hash ?? GENESIS;
    try {
      await AuditLog.create({ ...entry, prevHash, hash: hashEntry(prevHash, entry) });
      return;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw new Error("Could not append to the audit log (too much contention).");
}

export type ChainReport =
  | { ok: true; checked: number }
  | { ok: false; checked: number; brokenAt: number; problem: string };

/** Walk the whole chain from the first entry and recompute every hash. */
export async function verifyChain(): Promise<ChainReport> {
  await connectDB();
  let prevHash = GENESIS;
  let expectedSeq = 1;
  let checked = 0;

  for await (const e of AuditLog.find().sort({ seq: 1 }).lean().cursor()) {
    if (e.seq !== expectedSeq) {
      return { ok: false, checked, brokenAt: expectedSeq, problem: `Entry #${expectedSeq} is missing (deleted).` };
    }
    if (e.prevHash !== prevHash) {
      return { ok: false, checked, brokenAt: e.seq, problem: `Entry #${e.seq} doesn't link to the entry before it.` };
    }
    if (hashEntry(prevHash, e) !== e.hash) {
      return { ok: false, checked, brokenAt: e.seq, problem: `Entry #${e.seq} was changed after it was written.` };
    }
    prevHash = e.hash;
    expectedSeq++;
    checked++;
  }
  return { ok: true, checked };
}

/**
 * What changed between two versions of a record, as audit entries.
 * Sensitive fields log the field name only, never the values, so the audit
 * log doesn't turn into a second copy of everyone's PII.
 */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
  sensitive: ReadonlySet<string> = new Set(),
): Change[] {
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "(empty)" : String(v));
  const changes: Change[] = [];
  for (const f of fields) {
    const a = show(before[f]);
    const b = show(after[f]);
    if (a === b) continue;
    changes.push(sensitive.has(f) ? { field: f, from: "[redacted]", to: "[redacted]" } : { field: f, from: a, to: b });
  }
  return changes;
}
