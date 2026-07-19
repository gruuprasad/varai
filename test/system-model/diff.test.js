import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { diffSystemModels } from "../../src/system-model/diff.js";
import { renderSemanticDiff } from "../../src/reporters/diff-markdown.js";

function model({ output = false, file = "routes/projects.py", state = "observed" } = {}) {
  const subsystem = { key: "api", lens: "api", name: "API" };
  const operation = {
    subsystemKey: "api", key: "GET /projects/current", kind: "operation",
    name: "GET /projects/current", roles: ["interface", "behavior"],
    evidence: [{ file, line: 1 }], claimState: "observed",
    capability: "api.operation",
  };
  return createSystemModel({
    systemName: "fixture",
    subsystems: [subsystem],
    elements: [operation],
    claims: output ? [{
      source: { kind: "element", subsystemKey: "api", elementKind: "operation", key: operation.key },
      relation: "produces", target: { kind: "literal", valueType: "contract", value: "CurrentJobResponse" },
      slot: "response", claimState: state, evidence: [{ file, line: 1 }],
      capability: "api.output",
    }] : [],
  });
}

test("diff reports a newly produced contract as one added claim", () => {
  const diff = diffSystemModels(model(), model({ output: true }));
  assert.equal(diff.summary.semanticChanges, 1);
  assert.equal(diff.summary.claimsAdded, 1);
  assert.equal(diff.claims.added[0].relation, "produces");
  assert.match(renderSemanticDiff(diff), /GET \/projects\/current produces CurrentJobResponse/);
});

test("claim confidence changes preserve identity and report a changed claim", () => {
  const diff = diffSystemModels(model({ output: true, state: "inferred" }), model({ output: true, state: "observed" }));
  assert.equal(diff.summary.claimsAdded, 0);
  assert.equal(diff.summary.claimsRemoved, 0);
  assert.equal(diff.summary.claimsChanged, 1);
});

test("source movement is evidence-only progression", () => {
  const diff = diffSystemModels(model({ output: true, file: "a.py" }), model({ output: true, file: "b.py" }));
  assert.equal(diff.summary.hasChanges, false);
  assert.equal(diff.summary.hasEvidenceChanges, true);
  assert.equal(diff.claims.evidenceChanged.length, 1);
  assert.equal(diff.elements.evidenceChanged.length, 1);
});
