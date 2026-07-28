import assert from "node:assert/strict";
import test from "node:test";
import { reconcile } from "../../src/reconciliation/check.js";
import { seedContentHash } from "../../src/seed/identity.js";

function fixture({ claim = false, coverage = "analyzed" } = {}) {
  const seed = {
    formatVersion: 2, system: { id: "demo", name: "Demo" }, context: [],
    concepts: [
      { id: "behavior.ui", role: "behavior", name: "UI" },
      { id: "behavior.api", role: "behavior", name: "API" },
    ],
    commitments: [{
      id: "commitment.ui-must-not-depend-on-api", source: "behavior.ui", relation: "depends_on",
      expectation: "absent", target: { concept: "behavior.api" },
    }],
  };
  const model = {
    system: { id: "system:demo", key: "demo", name: "Demo" },
    subsystems: [{ id: "sub:ui", lens: "ui" }, { id: "sub:api", lens: "api" }],
    elements: [
      { id: "el:ui", subsystemId: "sub:ui", kind: "screen", key: "screen", name: "Screen", evidence: [] },
      { id: "el:api", subsystemId: "sub:api", kind: "operation", key: "GET /items", name: "GET /items", evidence: [] },
    ],
    claims: claim ? [{ id: "claim:edge", sourceId: "el:ui", relation: "depends_on", target: { kind: "reference", id: "el:api" }, claimState: "observed", evidence: [], implementationPath: [] }] : [],
    coverage: [{ capability: "arch.dependency", scopeId: "sub:ui", state: coverage }],
  };
  const realization = {
    formatVersion: 1, seedHash: seedContentHash(seed), witnesses: [],
    bindings: [
      { id: "binding.ui", concept: "behavior.ui", artifact: { lens: "ui", kind: "screen", key: "screen" } },
      { id: "binding.api", concept: "behavior.api", artifact: { lens: "api", kind: "operation", key: "GET /items" } },
    ],
  };
  return { seed, model, realization };
}

test("an observed expected-absent dependency is violated", () => {
  const { seed, model, realization } = fixture({ claim: true });
  const result = reconcile({ seed, model, realization }).commitments[0];
  assert.equal(result.verdict, "violated");
  assert.deepEqual(result.claimIds, ["claim:edge"]);
});

test("an absent expected-absent dependency holds under analyzed coverage", () => {
  const { seed, model, realization } = fixture();
  assert.equal(reconcile({ seed, model, realization }).commitments[0].verdict, "holds");
});

test("an absent expected-absent dependency stays unverified under partial coverage", () => {
  const { seed, model, realization } = fixture({ coverage: "partial" });
  assert.equal(reconcile({ seed, model, realization }).commitments[0].verdict, "cannot_verify");
});
