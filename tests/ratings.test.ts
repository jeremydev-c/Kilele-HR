/** The performance scale and the weighted overall score. No database.   npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { overallScore, ratingLabel } from "@/lib/ratings";

test("overall: the manager's ratings weighted by each goal's weight, to one decimal", () => {
  assert.equal(overallScore([{ weight: 50, rating: 5 }, { weight: 25, rating: 4 }, { weight: 25, rating: 4 }]), 4.5);
  assert.equal(overallScore([{ weight: 40, rating: 3 }, { weight: 40, rating: 4 }, { weight: 20, rating: 2 }]), 3.2);
  assert.equal(overallScore([{ weight: 1, rating: 1 }, { weight: 2, rating: 2 }]), 1.7, "rounded, whatever the weights add up to");
});

test("no overall until every goal is rated", () => {
  assert.equal(overallScore([{ weight: 50, rating: 4 }, { weight: 50, rating: null }]), null);
  assert.equal(overallScore([]), null);
});

test("labels: the nearest band", () => {
  assert.equal(ratingLabel(4.5), "Outstanding");
  assert.equal(ratingLabel(4.4), "Exceeds expectations");
  assert.equal(ratingLabel(3.2), "Meets expectations");
  assert.equal(ratingLabel(1), "Below expectations");
  assert.equal(ratingLabel(null), "Not rated yet");
});
