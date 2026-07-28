import assert from "node:assert/strict";
import test from "node:test";
import { literalMatches, relationContract } from "../../src/reconciliation/relations.js";

test("relation contracts keep checkability and coverage grain together", () => {
  assert.deepEqual(relationContract("creates"), {
    relation: "creates", checkable: true, capabilities: ["api.effect", "application.effect"], coverageGrain: "element",
  });
  assert.deepEqual(relationContract("depends_on"), {
    relation: "depends_on", checkable: true, capabilities: ["arch.dependency"], coverageGrain: "subsystem",
  });
  assert.equal(relationContract("performs").checkable, false);
  assert.equal(relationContract("performs").recordedOnly, true);
});

test("literal matching remains deterministic contiguous phrase matching", () => {
  assert.equal(literalMatches("409", "409"), true);
  assert.equal(literalMatches("acknowledged when preview", "integrity changes acknowledged when preview has integrity changes"), true);
  assert.equal(literalMatches("changes preview", "integrity changes acknowledged when preview has integrity changes"), false);
});
