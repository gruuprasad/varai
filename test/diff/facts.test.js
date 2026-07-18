import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisIR } from "../../src/ir/canonicalize.js";
import { diffAnalyses } from "../../src/diff/index.js";

const context = { activeExtractorIds: [], include: [], stacks: [] };
const make = (line, claimState = "observed") => createAnalysisIR({
  scanContext: context,
  facts: [{ kind: "api_route", name: "GET /items", evidence: [{ file: "routes.py", line }], layer: "ast", claimState }],
});

test("fact line movement is evidence-only", () => {
  const diff = diffAnalyses(make(1), make(2));
  assert.equal(diff.facts.changed.length, 0);
  assert.equal(diff.facts.evidenceChanged.length, 1);
  assert.equal(diff.summary.hasChanges, false);
});

test("fact claim-state regression remains semantic", () => {
  const diff = diffAnalyses(make(1), make(2, "unverified"));
  assert.equal(diff.facts.changed.length, 1);
  assert.equal(diff.summary.hasChanges, true);
});
