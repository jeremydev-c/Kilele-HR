/** Visitors' IP addresses on the public demo.   npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayIp } from "@/lib/ip";

test("on the demo, addresses keep only their network part", () => {
  assert.equal(displayIp("102.68.78.52", true), "102.68.•.•");
  assert.equal(displayIp("::ffff:41.90.12.7", true), "41.90.•.•");
  assert.equal(displayIp("2c0f:fe38:2405:1234::1", true), "2c0f:fe38:•");
  assert.equal(displayIp("::1", true), "this computer");
});

test("labels and missing values pass through", () => {
  assert.equal(displayIp("seed-11", true), "seed-11");
  assert.equal(displayIp(null, true), null);
});

test("a real deployment shows the full address", () => {
  assert.equal(displayIp("102.68.78.52", false), "102.68.78.52");
});
