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

test("duplicate semantic clauses merge evidence deterministically", () => {
  const behavior = (requires) => ({
    door: { method: "GET", path: "/items", evidence: { file: "route.py", line: 1 } }, bundle: null,
    requires, takes: [], gives: [], reads: [], writes: [], fails: [], untraced: [], helperCalls: [], trunkCall: null,
  });
  const a = { name: "auth", kind: "dependency", evidence: { file: "a.py", line: 2 }, layer: "ast" };
  const b = { name: "auth", kind: "dependency", evidence: { file: "b.py", line: 3 }, layer: "ast" };
  const left = createAnalysisIR({ scanContext: context, facts: [], behaviors: [behavior([a, b])] });
  const right = createAnalysisIR({ scanContext: context, facts: [], behaviors: [behavior([b, a])] });
  assert.deepEqual(left, right);
  assert.equal(left.behaviors[0].requires.length, 1);
  assert.equal(left.behaviors[0].requires[0].evidence.length, 2);
});

test("UI action identity ignores guard changes but separates source files", () => {
  const behavior = (source, guards = []) => ({
    door: { kind: "ui_action", source, component: "Modal", event: "click", action: "onClose", evidence: { file: source, line: 1 } },
    bundle: null, requires: [], takes: [], gives: [], reads: [], writes: [], fails: [], untraced: [], guards,
    helperCalls: [], trunkCall: null,
  });
  const a = createAnalysisIR({ scanContext: context, facts: [], behaviors: [behavior("a.tsx")] });
  const guarded = createAnalysisIR({ scanContext: context, facts: [], behaviors: [behavior("a.tsx", [
    { kind: "disabled_when", condition: "loading", evidence: { file: "a.tsx", line: 2 }, layer: "ast" },
  ])] });
  const other = createAnalysisIR({ scanContext: context, facts: [], behaviors: [behavior("b.tsx")] });
  assert.equal(a.behaviors[0].id, guarded.behaviors[0].id);
  assert.notEqual(a.behaviors[0].id, other.behaviors[0].id);
});
