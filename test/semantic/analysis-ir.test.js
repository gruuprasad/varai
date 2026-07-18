import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { canonicalStringify } from "../../src/ir/canonicalize.js";

const fixture = path.resolve("test/fixtures/behaviors-app");

test("identical content produces byte-identical Analysis IR", async () => {
  const a = await scanRepo(fixture, { jobs: 1, cache: false });
  const b = await scanRepo(fixture, { jobs: 4, cache: false });
  assert.equal(canonicalStringify(a.analysis), canonicalStringify(b.analysis));
  assert.deepEqual(a.systemModel, b.systemModel);
  assert.equal(a.analysis.schemaVersion, 2);
  assert.ok(a.analysis.behaviors.every((behavior) => behavior.id.startsWith("behavior:")));
});

test("stock pattern instances are preserved as structured IR", async () => {
  const scan = await scanRepo(fixture, { jobs: 1, cache: false });
  assert.ok(Array.isArray(scan.analysis.patternInstances));
});
