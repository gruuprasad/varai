import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAnalysis } from "../../src/semantic/evaluate.js";

const analysis = {
  behaviors: [{ id: "b", door: { method: "POST", path: "/signup" }, requires: [], takes: [], gives: [],
    reads: [], writes: [{ claimState: "inferred", medium: "db", target: "User" }], fails: [], untraced: [] }],
};

test("semantic evaluation enforces expected and forbidden claims", () => {
  const result = evaluateAnalysis(analysis, {
    expected: [{ collection: "clauses", where: { clauseKind: "writes", target: "User" } }],
    forbidden: [{ collection: "behaviors", where: { "door.path": "/admin" } }],
  });
  assert.equal(result.ok, true);
  const forbidden = evaluateAnalysis(analysis, {
    forbidden: [{ collection: "clauses", where: { clauseKind: "writes", claimState: "inferred" } }],
  });
  assert.equal(forbidden.ok, false);
});
