/**
 * Email checks that need no network, so they run in the browser too:
 *
 *   suggestEmail("jane@gmial.com")   → "jane@gmail.com"   (a likely typo of a common provider)
 *   isDisposable("x@mailinator.com") → true               (a throwaway inbox)
 *   canonicalEmail("Jane.Doe+cv@gmail.com") → "janedoe@gmail.com" (the same inbox, for duplicate checks)
 *
 * Whether a domain can actually receive mail needs DNS: see server/emailDomain.ts.
 */

/** Real providers people use. A domain on this list is never "corrected". */
const COMMON = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "outlook.com", "hotmail.com", "hotmail.co.uk",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me", "zoho.com",
  "gmx.com", "gmx.net", "mail.com", "email.com", "yandex.com", "inbox.com", "fastmail.com", "tutanota.com",
  "kilele.co.ke", "strathmore.edu", "students.uonbi.ac.ke", "uonbi.ac.ke", "ku.ac.ke", "jkuat.ac.ke", "safaricom.co.ke",
];
const COMMON_SET = new Set(COMMON);

/** Endings people mistype. Applied when the rest of the domain isn't a near-miss of a common provider. */
const ENDING_FIXES: [RegExp, string][] = [
  [/\.(con|cmo|cpm|vom|xom|comm|coom|om|cm|c0m)$/, ".com"],
  [/\.(co\.ek|co\.k|co\.kee|cok\.e|co\.ke\.)$/, ".co.ke"],
  [/\.(ac\.ek|ac\.k)$/, ".ac.ke"],
  [/\.(nte|ner|nett)$/, ".net"],
  [/\.(ogr|orgg|rog)$/, ".org"],
];

/** Throwaway inbox services. An application or a staff record needs an address that will still work next month. */
const DISPOSABLE = new Set([
  "mailinator.com", "mailinator.net", "10minutemail.com", "10minutemail.net", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamailblock.com", "sharklasers.com", "grr.la", "yopmail.com", "yopmail.net", "yopmail.fr",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "tempmailo.com", "tempail.com", "tempr.email",
  "throwawaymail.com", "trashmail.com", "trashmail.de", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc",
  "mailnesia.com", "mintemail.com", "mohmal.com", "emailondeck.com", "fakeinbox.com", "fakemail.net", "burnermail.io",
  "spamgourmet.com", "mailcatch.com", "moakt.com", "emailfake.com", "mail-temp.com", "minuteinbox.com", "discard.email",
  "33mail.com", "getairmail.com", "inboxkitten.com", "spambox.us", "mytemp.email", "1secmail.com", "1secmail.net",
]);

const split = (email: string) => {
  const at = email.lastIndexOf("@");
  return at < 1 ? null : { local: email.slice(0, at), domain: email.slice(at + 1).toLowerCase() };
};

/** Typing distance, counting a swap of two neighbours ("gmial") as one slip. */
function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The address the person probably meant, or null when it looks right.
 * Only suggests when the domain is one or two slips away from a common
 * provider (two only for longer names, so short real domains aren't "fixed"),
 * or has a mistyped ending like ".con".
 */
export function suggestEmail(email: string): string | null {
  const parts = split(email.trim());
  if (!parts || COMMON_SET.has(parts.domain)) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of COMMON) {
    const d = distance(parts.domain, c);
    if (d < bestD) { best = c; bestD = d; }
  }
  const allowed = parts.domain.length >= 9 ? 2 : 1;
  if (best && bestD <= allowed) return `${parts.local}@${best}`;
  for (const [rx, fix] of ENDING_FIXES) {
    if (rx.test(parts.domain)) return `${parts.local}@${parts.domain.replace(rx, fix)}`;
  }
  return null;
}

/** A throwaway inbox (the domain or any domain it sits under). */
export function isDisposable(email: string) {
  const parts = split(email.trim());
  if (!parts) return false;
  const labels = parts.domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) if (DISPOSABLE.has(labels.slice(i).join("."))) return true;
  return false;
}

/**
 * One inbox, one key: lower case, "+anything" dropped, and for Gmail the dots
 * too (Gmail ignores them). Used to spot the same person applying twice.
 */
export function canonicalEmail(email: string) {
  const parts = split(email.trim().toLowerCase());
  if (!parts) return email.trim().toLowerCase();
  let { local, domain } = parts;
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export const emailDomain = (email: string) => split(email.trim())?.domain ?? "";
