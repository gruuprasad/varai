import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { diffSystemModels } from "../../src/system-model/diff.js";

const fixture = (name) => path.resolve(`test/fixtures/anchor-lift/${name}`);
const scan = async (name) => (await scanRepo(fixture(name), { jobs: 1, cache: false, systemName: "anchor-lift-fixture" })).model;

test("helper-only refactor changes implementation evidence, not semantics", async () => {
  const before = await scan("base");
  const after = await scan("refactored");
  const diff = diffSystemModels(before, after);

  assert.equal(diff.summary.semanticChanges, 0);
  assert.ok(diff.summary.evidenceChanges > 0);
});

test("public response field change remains one structural semantic change", async () => {
  const before = await scan("base");
  const after = await scan("contract-changed");
  const diff = diffSystemModels(before, after);
  const added = diff.claims.added.filter((claim) => claim.relation === "has_field");

  assert.equal(added.length, 1);
  assert.equal(added[0].target.value, "warnings");
});
