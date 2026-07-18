import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisIR } from "../../src/ir/canonicalize.js";
import { dedupeFacts } from "../../src/scanners/utils.js";

const context = { activeExtractorIds: [], include: [], stacks: [] };

test("same named symbols in different semantic locations survive", () => {
  const facts = dedupeFacts([
    { kind: "schema", name: "Item", evidence: [{ file: "a.py", line: 1 }] },
    { kind: "schema", name: "Item", evidence: [{ file: "b.py", line: 1 }] },
  ]);
  assert.equal(facts.length, 2);
});

test("moving behavior evidence preserves behavior and clause identity", () => {
  const behavior = (file) => ({
    door: { method: "POST", path: "/items", evidence: { file, line: 1 } }, bundle: null,
    requires: [{ name: "auth", kind: "dependency", evidence: { file, line: 2 }, layer: "ast" }],
    takes: [], gives: [], reads: [], writes: [], fails: [], untraced: [], helperCalls: [], trunkCall: null,
  });
  const a = createAnalysisIR({ scanContext: context, facts: [], behaviors: [behavior("a.py")] });
  const b = createAnalysisIR({ scanContext: context, facts: [], behaviors: [behavior("b.py")] });
  assert.equal(a.behaviors[0].id, b.behaviors[0].id);
  assert.equal(a.behaviors[0].requires[0].id, b.behaviors[0].requires[0].id);
  assert.notDeepEqual(a.behaviors[0].door.evidence, b.behaviors[0].door.evidence);
});
