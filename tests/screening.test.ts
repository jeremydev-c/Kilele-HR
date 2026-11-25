/** Screening-question scoring. No database.   npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { meetsAutoShortlist, scoreAnswers, type Question } from "@/lib/screening";

const Q: Question[] = [
  { key: "q1", text: "Allowed to work in Kenya?", kind: "yesno", weight: 1, knockout: true, target: null, knockoutBelow: null },
  { key: "q2", text: "Years of React", kind: "number", weight: 3, knockout: false, target: 5, knockoutBelow: 2 },
  { key: "q3", text: "Shipped to production?", kind: "yesno", weight: 2, knockout: false, target: null, knockoutBelow: null },
  { key: "q4", text: "Expected salary", kind: "number", weight: 0, knockout: false, target: null, knockoutBelow: null },
];

test("a strong candidate scores 100 with no knock-outs", () => {
  assert.deepEqual(scoreAnswers(Q, { q1: "yes", q2: "6", q3: "yes", q4: "180000" }), { score: 100, knockouts: [] });
});

test("number answers score in proportion to the target, capped at full marks", () => {
  // q1 1×1 + q2 (3/5)×3 + q3 0×2 = 2.8 of 6 → 47
  assert.equal(scoreAnswers(Q, { q1: "yes", q2: "3", q3: "no", q4: "1" }).score, 47);
});

test("weight 0 is information only: it never changes the score", () => {
  const a = scoreAnswers(Q, { q1: "yes", q2: "5", q3: "yes", q4: "1" }).score;
  const b = scoreAnswers(Q, { q1: "yes", q2: "5", q3: "yes", q4: "9999999" }).score;
  assert.equal(a, b);
});

test("knock-outs are flagged (not hidden) for yes/no and minimum numbers", () => {
  const r = scoreAnswers(Q, { q1: "no", q2: "1", q3: "yes", q4: "0" });
  assert.deepEqual(r.knockouts, ["Allowed to work in Kenya?", "Years of React"]);
  assert.ok(r.score > 0, "still scored, so a person can judge the edge case");
});

test("missing or nonsense answers score zero", () => {
  assert.equal(scoreAnswers(Q, { q2: "lots" }).score, 0);
});

test("automatic shortlisting: at or above the pass mark, every must-have met, and only when switched on", () => {
  assert.equal(meetsAutoShortlist(70, 70, []), true, "the pass mark itself passes");
  assert.equal(meetsAutoShortlist(70, 69, []), false);
  assert.equal(meetsAutoShortlist(70, 100, ["Allowed to work in Kenya?"]), false, "a missed must-have always waits for a person");
  assert.equal(meetsAutoShortlist(null, 100, []), false, "off");
  assert.equal(meetsAutoShortlist(undefined, 100, []), false, "never set");
});
