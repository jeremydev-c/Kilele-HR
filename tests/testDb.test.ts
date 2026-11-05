/** The DB tests run on their own database, so they can't wipe the demo.   npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { testDatabaseUri } from "@/lib/testDb";

test("the local demo database gets a _test twin, query string kept", () => {
  assert.equal(
    testDatabaseUri("mongodb://127.0.0.1:27027/kilele_hr?replicaSet=kilele"),
    "mongodb://127.0.0.1:27027/kilele_hr_test?replicaSet=kilele",
  );
});

test("Atlas URIs and URIs without a database name work too", () => {
  assert.equal(
    testDatabaseUri("mongodb+srv://u:p@cluster.mongodb.net/kilele_hr?retryWrites=true"),
    "mongodb+srv://u:p@cluster.mongodb.net/kilele_hr_test?retryWrites=true",
  );
  assert.equal(testDatabaseUri("mongodb://127.0.0.1:27027"), "mongodb://127.0.0.1:27027/kilele_hr_test");
});

test("running it twice doesn't stack suffixes", () => {
  const once = testDatabaseUri("mongodb://127.0.0.1:27027/kilele_hr");
  assert.equal(testDatabaseUri(once), once);
});
