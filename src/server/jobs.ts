import { connectDB } from "@/lib/db";
import { Movement } from "./models/Movement";
import { Separation } from "./models/Separation";
import { applyMovementIfDue } from "./services/movements";
import { completeIfDue, startClearance } from "./services/separations";

/**
 * The scheduled job: things that happen on a date rather than on a click.
 *   - approved promotions/demotions whose effective date has come
 *   - exits whose last day has come (and every clearance item is signed)
 *   - any approval hook that failed earlier (each step is idempotent)
 *
 * Started by src/instrumentation.ts when the server boots, then every 10 minutes.
 */
export async function runDueJobs(now = new Date()) {
  await connectDB();
  const results = { movements: 0, separations: 0 };

  const moves = await Movement.find({ "workflow.status": "approved", appliedAt: null }).select("_id").lean();
  for (const m of moves) if (await applyMovementIfDue(m._id, now)) results.movements++;

  const exits = await Separation.find({ "workflow.status": "approved", completedAt: null }).select("_id clearance").lean();
  for (const s of exits) {
    if (!s.clearance.length) await startClearance(s._id, now); // a hook that didn't run
    if (await completeIfDue(s._id, now)) results.separations++;
  }
  return results;
}
