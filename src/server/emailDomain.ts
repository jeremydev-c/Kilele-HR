import { promises as dns } from "node:dns";
import { emailDomain, isDisposable, suggestEmail } from "@/lib/emailCheck";
import { FieldProblem } from "./errors";

/**
 * Can this domain receive email? Asks DNS, the way a mail server would:
 *   MX records          → yes
 *   "null MX" (RFC 7505) → no: the domain says it takes no mail
 *   no MX, but an address (A/AAAA) → yes: mail falls back to it
 *   the domain doesn't exist → no
 * Anything else (no internet, a slow DNS server) → "unknown", and we let the
 * address through: our network trouble must never block a real candidate.
 *
 * EMAIL_DOMAIN_CHECK=off skips the lookup (the tests use example.com addresses).
 */
export type MailVerdict = "yes" | "no" | "unknown";

type Lookup = (domain: string) => Promise<MailVerdict>;
const TIMEOUT_MS = 3000;
const cache = new Map<string, { verdict: MailVerdict; until: number }>();

const gone = (err: unknown) => ["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes((err as { code?: string })?.code ?? "");

async function dnsLookup(domain: string): Promise<MailVerdict> {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length === 0) throw Object.assign(new Error("no MX"), { code: "ENODATA" });
    const nullMx = mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".");
    return nullMx ? "no" : "yes";
  } catch (err) {
    if (!gone(err)) return "unknown";
  }
  // No MX: an address record still accepts mail.
  const results = await Promise.allSettled([dns.resolve4(domain), dns.resolve6(domain)]);
  if (results.some((r) => r.status === "fulfilled" && r.value.length > 0)) return "yes";
  return results.every((r) => r.status === "rejected" && gone(r.reason)) ? "no" : "unknown";
}

let lookup: Lookup = dnsLookup;

/** Tests swap in a fake so they never depend on the internet. */
export function setMailLookupForTests(fn: Lookup | null) {
  lookup = fn ?? dnsLookup;
  cache.clear();
}

export async function domainReceivesMail(domain: string): Promise<MailVerdict> {
  if (process.env.EMAIL_DOMAIN_CHECK === "off" && lookup === dnsLookup) return "unknown";
  const hit = cache.get(domain);
  if (hit && hit.until > Date.now()) return hit.verdict;
  const verdict = await Promise.race([
    lookup(domain).catch((): MailVerdict => "unknown"),
    new Promise<MailVerdict>((r) => setTimeout(() => r("unknown"), TIMEOUT_MS)),
  ]);
  // Remember answers for an hour; don't remember "unknown", so the next try asks again.
  if (verdict !== "unknown") cache.set(domain, { verdict, until: Date.now() + 3_600_000 });
  return verdict;
}

/**
 * What's wrong with an email address, in words for the form, or null.
 *   typo        "Did you mean …?" unless the person said their spelling is right (`confirmed`)
 *   disposable  throwaway inboxes are refused
 *   domain      a domain that can't receive mail is refused (only where `checkDomain`)
 */
export async function emailProblem(
  email: string,
  opts: { confirmed?: string | null; checkDomain?: boolean } = {},
): Promise<string | null> {
  const suggestion = suggestEmail(email);
  if (suggestion && (opts.confirmed ?? "").trim().toLowerCase() !== email.toLowerCase()) {
    return `Check the spelling: did you mean ${suggestion}? If yours is right, choose "Keep mine".`;
  }
  if (isDisposable(email)) return "Use a permanent email address, not a temporary inbox.";
  if (opts.checkDomain) {
    const domain = emailDomain(email);
    if ((await domainReceivesMail(domain)) === "no") return `${domain} can't receive email. Check the address for typos.`;
  }
  return null;
}

/**
 * For services: check `field` of a submitted form and stop with a message under
 * that field. "Keep mine" on the form sends `<field>Confirmed` with the address
 * the person stood by, which silences the typo check for that exact address.
 */
export async function assertEmailOk(field: string, email: string, input: unknown, opts: { checkDomain?: boolean } = {}) {
  if (!email) return;
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>)[`${field}Confirmed`] : undefined;
  const problem = await emailProblem(email, { confirmed: typeof raw === "string" ? raw : null, checkDomain: opts.checkDomain });
  if (problem) throw new FieldProblem(field, problem);
}
