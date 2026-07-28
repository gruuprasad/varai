import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequirementCoverage } from "../../src/evolution/report.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { seedContentHash } from "../../src/seed/identity.js";

function scenario({ state = "analyzed" } = {}) {
  const seed = {
    formatVersion: 1, system: { id: "demo", name: "Demo" }, context: [],
    concepts: [
      { id: "behavior.book", role: "behavior", name: "Book" },
      { id: "resource.booking", role: "resource", name: "Booking" },
    ],
    commitments: [{ id: "commitment.book-creates-booking", source: "behavior.book", relation: "creates", target: { concept: "resource.booking" } }],
  };
  const model = {
    system: { id: "system:demo", key: "demo", name: "Demo" },
    subsystems: [{ id: "sub:api", lens: "api" }, { id: "sub:data", lens: "data" }],
    elements: [
      { id: "el:book", subsystemId: "sub:api", kind: "operation", key: "POST /bookings", name: "POST /bookings", evidence: [] },
      { id: "el:booking", subsystemId: "sub:data", kind: "entity", key: "Booking", name: "Booking", evidence: [] },
    ],
    claims: [],
    coverage: [{ capability: "api.effect", scopeId: "el:book", state }],
  };
  const realization = {
    formatVersion: 1, seedHash: seedContentHash(seed), witnesses: [],
    bindings: [
      { id: "binding.book", concept: "behavior.book", artifact: { lens: "api", kind: "operation", key: "POST /bookings" } },
      { id: "binding.booking", concept: "resource.booking", artifact: { lens: "data", kind: "entity", key: "Booking" } },
    ],
  };
  return { seed, model, realization };
}

test("an absent effect violates only under exact element-scoped analyzed coverage", () => {
  const { seed, model, realization } = scenario();
  const item = reconcile({ seed, model, realization }).commitments[0];
  assert.equal(item.verdict, "violated");
  assert.equal(item.coverage[0].scopeId, "el:book");
});

test("partial element coverage keeps an absent effect unverified", () => {
  const { seed, model, realization } = scenario({ state: "partial" });
  assert.equal(reconcile({ seed, model, realization }).commitments[0].verdict, "cannot_verify");
});

test("reconcile projects analyzerVersion onto report coverage", () => {
  const { seed, model, realization } = scenario();
  model.coverage[0].analyzerVersion = "0.20.0";
  const item = reconcile({ seed, model, realization }).commitments[0];
  assert.equal(item.coverage[0].analyzerVersion, "0.20.0",
    "progression needs analyzerVersion on report coverage to distinguish analyzer drift from application change");
});

test("reconcile-projected coverage version drift classifies as analyzer_version_changed", () => {
  const { seed, model, realization } = scenario();
  model.coverage[0].analyzerVersion = "0.20.0";
  const before = reconcile({ seed, model, realization }).commitments[0].coverage;
  const afterModel = structuredClone(model);
  afterModel.coverage[0].analyzerVersion = "0.21.0";
  const after = reconcile({ seed, model: afterModel, realization }).commitments[0].coverage;
  assert.equal(classifyRequirementCoverage(before, after), "analyzer_version_changed");
});
