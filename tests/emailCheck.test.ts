/** Email checks: typos, throwaway inboxes, one inbox written two ways, and domains that take no mail. No database, no internet.   npm test */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { canonicalEmail, isDisposable, suggestEmail } from "@/lib/emailCheck";
import { domainReceivesMail, emailProblem, setMailLookupForTests } from "@/server/emailDomain";

after(() => setMailLookupForTests(null));

test("typos of common providers and mistyped endings get a suggestion", () => {
  const cases: [string, string][] = [
    ["jane@gmial.com", "jane@gmail.com"],
    ["jane@gmail.co", "jane@gmail.com"],
    ["jane@gamil.com", "jane@gmail.com"],
    ["jane@yaho.com", "jane@yahoo.com"],
    ["jane@outlok.com", "jane@outlook.com"],
    ["jane@hotmial.com", "jane@hotmail.com"],
    ["jane@iclod.com", "jane@icloud.com"],
    ["jane.k@kilele.co.ek", "jane.k@kilele.co.ke"],
    ["jane@acme.con", "jane@acme.com"],
    ["jane@mycompany.co.k", "jane@mycompany.co.ke"],
  ];
  for (const [typed, meant] of cases) assert.equal(suggestEmail(typed), meant, typed);
});

test("real addresses are left alone", () => {
  for (const ok of [
    "jane@gmail.com", "jane@ymail.com", "jane@mail.com", "jane@strathmore.edu", "jane@yahoo.fr", "jane@gmx.de",
    "jane@kilele.co.ke", "jane@equitybank.co.ke", "jane@students.uonbi.ac.ke", "jane@example.org", "not-an-email",
  ]) {
    assert.equal(suggestEmail(ok), null, ok);
  }
});

test("throwaway inboxes are spotted, subdomains too", () => {
  assert.equal(isDisposable("x@mailinator.com"), true);
  assert.equal(isDisposable("x@team.mailinator.com"), true);
  assert.equal(isDisposable("x@yopmail.com"), true);
  assert.equal(isDisposable("x@gmail.com"), false);
});

test("one inbox, one key: case, +tags and Gmail's dots", () => {
  assert.equal(canonicalEmail("Jane.Doe+CV@GMAIL.com"), "janedoe@gmail.com");
  assert.equal(canonicalEmail("jane.doe@googlemail.com"), "janedoe@gmail.com");
  assert.equal(canonicalEmail("jane.doe+jobs@outlook.com"), "jane.doe@outlook.com", "dots only ignored at Gmail");
});

test("the form message: typo unless kept, throwaway refused, dead domains refused, our DNS trouble never blocks", async () => {
  const verdicts: Record<string, "yes" | "no" | "unknown"> = { "nomail.test": "no", "works.test": "yes", "flaky.test": "unknown" };
  setMailLookupForTests(async (d) => verdicts[d] ?? "yes");

  assert.match((await emailProblem("jane@gmial.com"))!, /did you mean jane@gmail\.com/);
  assert.equal(await emailProblem("jane@gmial.com", { confirmed: "JANE@gmial.com" }), null, '"Keep mine" for that exact address');
  assert.match((await emailProblem("jane@gmial.com", { confirmed: "other@gmial.com" }))!, /did you mean/, "only the address they kept");
  assert.match((await emailProblem("x@mailinator.com"))!, /permanent email/);
  assert.match((await emailProblem("jane@nomail.test", { checkDomain: true }))!, /nomail\.test can't receive email/);
  assert.equal(await emailProblem("jane@nomail.test"), null, "domain only checked where asked");
  assert.equal(await emailProblem("jane@works.test", { checkDomain: true }), null);
  assert.equal(await emailProblem("jane@flaky.test", { checkDomain: true }), null, "unknown lets it through");
  assert.equal(await domainReceivesMail("nomail.test"), "no");
});
