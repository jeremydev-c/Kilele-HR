/**
 * Runs once when the Next.js server starts: kick off the scheduled job
 * (server/jobs.ts) now and every 10 minutes. On a multi-server deployment
 * this would move to one cron worker so the job doesn't run on every server
 * (though it's safe if it does: each change is claimed once).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.MONGODB_URI) return;
  const { runDueJobs } = await import("./server/jobs");
  const run = () =>
    runDueJobs()
      .then((r) => (r.movements || r.separations) && console.log(`[jobs] applied ${r.movements} promotion(s), completed ${r.separations} exit(s)`))
      .catch((err) => console.error("[jobs] failed", err));
  setTimeout(run, 5_000);
  setInterval(run, 10 * 60_000).unref();
}
