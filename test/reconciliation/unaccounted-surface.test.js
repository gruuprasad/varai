import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { renderCheckText } from "../../src/reconciliation/report.js";
import { renderSurfacesSection } from "../../src/reconciliation/surface-report.js";
import { evaluateBuildGate } from "../../src/build-session/evaluate.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { seedContentHash } from "../../src/seed/identity.js";

function modelWithOps(keys) {
  return createSystemModel({
    systemName: "purchase",
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: keys.map((key, index) => ({
      subsystemKey: "api",
      key,
      kind: "operation",
      roles: ["interface", "behavior"],
      name: key,
      evidence: [{ file: "routes.py", line: index + 1, symbol: `op_${index}` }],
      claimState: "observed",
      capability: "api.operation",
    })),
  });
}

function seedWithSurfaces(surfaces) {
  const seed = {
    formatVersion: 3,
    system: { id: "purchase", name: "Purchase" },
    concepts: [
      { id: "behavior.submit", role: "behavior", name: "Submit" },
      { id: "behavior.delete", role: "behavior", name: "Delete" },
    ],
    commitments: [],
    surfaces,
    scenarios: [],
    context: [],
  };
  return seed;
}

test("extra DELETE route remains unaccounted when every declared surface is bound", () => {
  const submit = "POST /api/purchase-requests";
  const del = "DELETE /api/purchase-requests/{id}";
  const model = modelWithOps([submit, del]);
  const seed = seedWithSurfaces([{
    id: "surface.submit-api",
    name: "Submit purchase request API",
    behavior: "behavior.submit",
    channel: "api",
    access: "authenticated",
  }]);
  const seedHash = seedContentHash(seed);
  const report = reconcile({
    model,
    seed,
    realization: {
      formatVersion: 2,
      seedHash,
      bindings: [],
      surfaceBindings: [{
        id: "surface-binding.submit-api",
        surface: "surface.submit-api",
        artifact: { lens: "api", kind: "operation", key: submit },
      }],
      witnesses: [],
    },
  });
  assert.equal(report.surfaces.accounted.length, 1);
  assert.equal(report.surfaces.missing.length, 0);
  assert.equal(report.surfaces.unaccounted.length, 1);
  assert.equal(report.surfaces.unaccounted[0].key, del);
});

test("surface report text names unaccounted public behavior", () => {
  const model = modelWithOps(["DELETE /api/purchase-requests/{id}"]);
  const seed = seedWithSurfaces([]);
  const report = reconcile({ model, seed, realization: null });
  const section = renderSurfacesSection(report.surfaces, { model });
  assert.ok(/unaccounted/i.test(section));
  assert.ok(section.includes("DELETE /api/purchase-requests/{id}"));
  const full = renderCheckText(report, { model });
  assert.ok(/public surfaces|surfaces/i.test(full));
  assert.ok(full.includes("DELETE /api/purchase-requests/{id}"));
});

test("build gate needs_attention when completion report has unaccounted surfaces", () => {
  const model = modelWithOps(["POST /api/purchase-requests"]);
  const seed = seedWithSurfaces([]);
  const report = reconcile({ model, seed, realization: null });
  assert.ok(report.surfaces.unaccounted.length > 0);

  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: report,
    completionReport: report,
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.ok(gate.reasons.some((reason) => reason.includes("unaccounted-surface")));
  assert.ok(gate.surfaceProblems?.unaccounted > 0);
});

test("build gate stays ready when surfaces are fully accounted", () => {
  const key = "POST /api/purchase-requests";
  const model = modelWithOps([key]);
  const seed = seedWithSurfaces([{
    id: "surface.submit-api",
    name: "Submit",
    behavior: "behavior.submit",
    channel: "api",
    access: "authenticated",
  }]);
  const seedHash = seedContentHash(seed);
  const report = reconcile({
    model,
    seed,
    realization: {
      formatVersion: 2,
      seedHash,
      bindings: [],
      surfaceBindings: [{
        id: "surface-binding.submit-api",
        surface: "surface.submit-api",
        artifact: { lens: "api", kind: "operation", key },
      }],
      witnesses: [],
    },
  });
  assert.equal(report.surfaces.unaccounted.length, 0);
  assert.equal(report.surfaces.missing.length, 0);

  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: { commitments: [], surfaces: report.surfaces },
    completionReport: report,
  });
  assert.equal(gate.state, GATE_STATES.READY);
});

test("v1/v2 cannot_account does not by itself block ready", () => {
  const model = modelWithOps(["POST /api/purchase-requests", "DELETE /api/x"]);
  const seed = {
    formatVersion: 1,
    system: { id: "legacy", name: "Legacy" },
    concepts: [],
    commitments: [],
    context: [],
  };
  const report = reconcile({ model, seed, realization: null });
  assert.equal(report.surfaces.state, "cannot_account");
  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: report,
    completionReport: report,
  });
  assert.equal(gate.state, GATE_STATES.READY);
});
