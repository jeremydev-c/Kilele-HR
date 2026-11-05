/** Advert templates: department sets the topic, grade sets the level. No database.   npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { advertFromTemplate } from "@/lib/advertTemplates";

const base = { deptName: "Finance", justification: "Francis retires in February." };

test("an entry-level Finance job gets entry wording, 1 year, and the CPA question", () => {
  const a = advertFromTemplate({ ...base, title: "Accounts Assistant", deptCode: "FIN", grade: "G2" });
  assert.match(a.summary, /^We're hiring an entry-level Accounts Assistant/);
  assert.match(a.summary, /Francis retires in February\.$/, "the manager's reason is kept");
  assert.match(a.requirements, /1\+ year of relevant experience/);
  assert.ok(a.questions.some((q) => q.text.includes("CPA")));
  const years = a.questions.find((q) => q.kind === "number" && q.weight > 0)!;
  assert.equal(years.knockoutBelow, null, "no minimum for entry level");
});

test("a senior job asks for more experience and makes too little a knock-out", () => {
  const a = advertFromTemplate({ ...base, deptName: "Engineering", title: "Lead Engineer", deptCode: "ENG", grade: "G5" });
  assert.match(a.summary, /a senior Lead Engineer/);
  const years = a.questions.find((q) => q.kind === "number" && q.weight > 0)!;
  assert.equal(years.target, 7);
  assert.equal(years.knockoutBelow, 5);
});

test("every draft asks the right-to-work question and an info-only salary question", () => {
  const a = advertFromTemplate({ ...base, title: "Anything", deptCode: "UNKNOWN", grade: "G3" });
  assert.equal(a.questions[0].knockout, true);
  assert.equal(a.questions.at(-1)!.weight, 0);
});
