import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { diffSystemModels } from "../../src/system-model/diff.js";

const beforeFixture = path.resolve("test/fixtures/frontend-integrity-guard/before");
const afterFixture = path.resolve("test/fixtures/frontend-integrity-guard/after");

test("integrity acknowledgment becomes one conditional UI requirement", async () => {
  const before = await scanRepo(beforeFixture, { jobs: 1, cache: false });
  const after = await scanRepo(afterFixture, { jobs: 1, cache: false });
  const diff = diffSystemModels(before.model, after.model);

  assert.equal(diff.elements.added.length, 0);
  assert.equal(diff.elements.removed.length, 0);
  assert.equal(diff.claims.removed.length, 0);
  assert.equal(diff.claims.changed.length, 0);
  assert.equal(diff.claims.added.length, 1);
  assert.equal(diff.claims.added[0].relation, "requires");
  assert.equal(
    diff.claims.added[0].target.value,
    "integrity changes acknowledged when preview has integrity changes",
  );
});
