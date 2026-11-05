import { NextResponse } from "next/server";
import { runDueJobs } from "@/server/jobs";

/**
 * The scheduled job on Vercel (see vercel.json): serverless functions sleep
 * between requests, so the timer in instrumentation.ts can't be relied on there.
 * Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDueJobs();
  return NextResponse.json({ ok: true, ...result });
}
