import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisIR } from "../../src/ir/canonicalize.js";
import { diffAnalyses } from "../../src/diff/index.js";

const context = { activeExtractorIds: [], include: [], stacks: [] };
function ir({ requires = [], writes = [], file = "routes.py", state = "observed" } = {}) {
  return createAnalysisIR({ scanContext: context, facts: [], behaviors: [{
    door: { method: "POST", path: "/items", evidence: { file, line: 1 } }, bundle: null,
    requires: requires.map((name) => ({ name, kind: "dependency", evidence: { file, line: 2 }, layer: "ast" })),
    takes: [], gives: [], reads: [],
    writes: writes.map((target) => ({ medium: "db", target, evidence: { file, line: 3 }, layer: state === "observed" ? "ast" : "heuristic", claimState: state })),
    fails: [], untraced: [], helperCalls: [], trunkCall: null,
  }] });
}

test("new write and removed gate are prominent clause changes", () => {
  const diff = diffAnalyses(ir({ requires: ["auth"] }), ir({ writes: ["Project"] }));
  const changes = diff.behaviors.changed[0].clauses;
  assert.ok(changes.some((item) => item.change === "added" && item.kind === "writes"));
  assert.ok(changes.some((item) => item.change === "removed" && item.kind === "requires"));
});

test("handler movement is evidence-only", () => {
  const diff = diffAnalyses(ir({ file: "a.py", requires: ["auth"] }), ir({ file: "b.py", requires: ["auth"] }));
  assert.ok(diff.behaviors.changed[0].clauses.every((item) => item.change === "evidence-moved"));
});

test("claim becoming unverified is classified", () => {
  const diff = diffAnalyses(ir({ writes: ["Project"] }), ir({ writes: ["Project"], state: "unverified" }));
  assert.equal(diff.behaviors.changed[0].clauses[0].change, "claim-state");
});
