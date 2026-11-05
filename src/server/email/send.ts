import { connectDB } from "@/lib/db";
import { Email } from "../models/Email";

/**
 * Sending email through Resend (https://resend.com), with every message saved
 * to the Emails log first. Sending never throws: an email problem must not
 * undo or block the approval, application or hire that triggered it.
 *
 * Settings (.env.local / Vercel):
 *   RESEND_API_KEY   turns real sending on (RESEND_API works too); without it emails are only saved
 *   EMAIL_FROM       e.g. "Kilele HR <hr@your-domain.co.ke>" (a domain verified in Resend)
 *   APP_URL          the site's address for links; on Vercel it's worked out automatically
 *   EMAIL_DELIVERY   "seed" or "off": save without sending (the seed and the tests set these)
 */

export type Outgoing = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  kind: string;
  entity?: string;
  entityId?: string;
};

/** Addresses that are never sent to: reserved test domains always, and the made-up demo company in demo mode. */
export function deliveryBlock(to: string, env: Record<string, string | undefined> = process.env): string | null {
  const domain = to.split("@")[1]?.toLowerCase() ?? "";
  if (/(^|\.)example\.(com|org|net)$/.test(domain) || domain.endsWith(".test") || domain.endsWith(".invalid")) {
    return "Test address: shown here, never sent.";
  }
  if (env.DEMO_MODE === "true" && /(^|\.)kilele\.co\.ke$/.test(domain)) {
    return "Made-up demo address: shown here, never sent.";
  }
  return null;
}

/** The Resend key, under either name people tend to give it. */
export function resendKey(env: Record<string, string | undefined> = process.env) {
  return env.RESEND_API_KEY || env.RESEND_API || "";
}

export function appUrl(env: Record<string, string | undefined> = process.env) {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export async function sendEmail(m: Outgoing) {
  const to = m.to.trim().toLowerCase();
  let status: "sent" | "failed" | "skipped" | "saved" = "saved";
  let reason = "";
  let providerId: string | null = null;

  const block = deliveryBlock(to);
  if (process.env.EMAIL_DELIVERY === "seed") {
    reason = "Written while the demo data was loaded, so never sent.";
  } else if (process.env.EMAIL_DELIVERY === "off") {
    reason = "Email sending is off for this run (tests).";
  } else if (!resendKey()) {
    reason = "No email service connected yet (add RESEND_API_KEY).";
  } else if (block) {
    status = "skipped";
    reason = block;
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "Kilele HR <onboarding@resend.dev>",
          to: [m.toName ? `${m.toName.replace(/[<>"]/g, "")} <${to}>` : to],
          subject: m.subject,
          html: m.html,
          text: m.text,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok) {
        status = "sent";
        providerId = body.id ?? null;
      } else {
        status = "failed";
        reason = `Resend said ${res.status}: ${body.message ?? res.statusText}`.slice(0, 300);
      }
    } catch (err) {
      status = "failed";
      reason = `Couldn't reach Resend: ${(err as Error).message}`.slice(0, 300);
    }
  }

  try {
    await connectDB();
    await Email.create({ ...m, to, status, reason, providerId });
  } catch (err) {
    console.error("[email] couldn't save to the log", err);
  }
  return status;
}

/** Several emails at once; never throws. */
export async function sendAll(messages: Outgoing[]) {
  await Promise.allSettled(messages.map(sendEmail));
}
