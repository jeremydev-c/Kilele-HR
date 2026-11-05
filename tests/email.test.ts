/** Emails: what they say, that they're safe, and which addresses never get one. No database.   npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "@/server/email/templates";
import { appUrl, deliveryBlock, resendKey } from "@/server/email/send";

test("an applicant's email has their link, reference and a plain-text twin", () => {
  const m = T.applicationReceived({ name: "Achieng Odhiambo", job: "Senior Frontend Engineer", number: "APP-2026-0001", link: "https://kilele-hr.vercel.app/careers/status/abc" });
  assert.equal(m.subject, "We got your application for Senior Frontend Engineer");
  assert.match(m.html, /Thanks, Achieng\./);
  assert.match(m.html, /href="https:\/\/kilele-hr\.vercel\.app\/careers\/status\/abc"/);
  assert.match(m.text, /APP-2026-0001/);
  assert.doesNotMatch(m.text, /</, "plain text has no markup");
});

test("anything a person typed is escaped, so an email can't carry code", () => {
  const m = T.applicationReceived({ name: `<script>alert(1)</script>`, job: `"Dev" & <b>Ops</b>`, number: "APP-1", link: "https://x.test/?a=1&b=2" });
  assert.doesNotMatch(m.html, /<script>/);
  assert.match(m.html, /&lt;b&gt;Ops&lt;\/b&gt;/);
  assert.match(m.html, /href="https:\/\/x\.test\/\?a=1&amp;b=2"/);
});

test("interview, offer and decision emails carry the facts", () => {
  const i = T.interviewInvite({ name: "Kip Langat", job: "Engineer", when: "Friday, 20 November 2026 at 10:00", minutes: 45, how: "Video call", where: "Meet link" });
  assert.match(i.html, /20 November 2026 at 10:00 \(Nairobi time\)/);
  const o = T.offerMade({ name: "Kip", job: "Engineer", salary: "KES 150,000 a month", start: "4 January 2027", replyBy: "20 November 2026" });
  assert.match(o.text, /Salary: KES 150,000 a month/);
  const d = T.decided({ name: "Mercy", what: "Annual leave", outcome: "rejected", by: "Grace", comment: "Month-end close", link: "https://x" });
  assert.equal(d.subject, "Not approved: Annual leave");
  assert.match(d.html, /Month-end close/);
});

test("we never email a password, only say it was reset", () => {
  const m = T.passwordReset({ name: "Mercy Njeri", by: "Grace Wanjiru", link: "https://x/login" });
  assert.match(m.text, /Grace Wanjiru reset your password/);
  assert.doesNotMatch(m.text, /password is|your new password:/i);
});

test("test domains are never sent to; the made-up demo company only in demo mode", () => {
  assert.ok(deliveryBlock("someone@example.com", {}));
  assert.ok(deliveryBlock("a@b.test", {}));
  assert.ok(deliveryBlock("grace.wanjiru@kilele.co.ke", { DEMO_MODE: "true" }));
  assert.ok(deliveryBlock("peter.kamau@audit.kilele.co.ke", { DEMO_MODE: "true" }));
  assert.equal(deliveryBlock("grace.wanjiru@kilele.co.ke", {}), null, "a real Kilele deployment does email its staff");
  assert.equal(deliveryBlock("jeremy@gmail.com", { DEMO_MODE: "true" }), null, "real applicants get real email");
});

test("links point at the right site: APP_URL, then Vercel, then this computer", () => {
  assert.equal(appUrl({ APP_URL: "https://hr.kilele.co.ke/" }), "https://hr.kilele.co.ke");
  assert.equal(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "kilele-hr.vercel.app" }), "https://kilele-hr.vercel.app");
  assert.equal(appUrl({}), "http://localhost:3000");
});

test("the Resend key works under either name", () => {
  assert.equal(resendKey({ RESEND_API_KEY: "re_a" }), "re_a");
  assert.equal(resendKey({ RESEND_API: "re_b" }), "re_b");
  assert.equal(resendKey({}), "");
});
