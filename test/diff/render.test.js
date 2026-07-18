import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisIR } from "../../src/ir/canonicalize.js";
import { diffAnalyses } from "../../src/diff/index.js";
import { renderSemanticDiff } from "../../src/reporters/diff-markdown.js";

const context = { activeExtractorIds: [], include: [], stacks: [] };
const make = (file) => createAnalysisIR({ scanContext: context, facts: [], behaviors: [{
  door: { method: "GET", path: "/items", evidence: { file, line: 1 } }, bundle: null,
  requires: [], takes: [], gives: [], reads: [], writes: [], fails: [], untraced: [], helperCalls: [], trunkCall: null,
}] });

test("default markdown collapses evidence movement and opt-in renders it", () => {
  const diff = diffAnalyses(make("a.py"), make("b.py"));
  const normal = renderSemanticDiff(diff);
  assert.match(normal, /No semantic changes/);
  assert.doesNotMatch(normal, /a\.py -> b\.py/);
  const verbose = renderSemanticDiff(diff, { showEvidenceMoves: true });
  assert.match(verbose, /Evidence movement/);
  assert.match(verbose, /a\.py:1 -> b\.py:1/);
});
