import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { resolveSurfaceBindings } from "../../src/reconciliation/resolve.js";
import { evaluateBuildGate } from "../../src/build-session/evaluate.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { seedContentHash } from "../../src/seed/identity.js";

const SUBMIT = "POST /api/purchase-requests";
const DELETE = "DELETE /api/purchase-requests/{id}";

function purchaseModel({ deleteHandlerFile = "routes.py", deleteSymbol = "delete_request" } = {}) {
  return createSystemModel({
    systemName: "purchase-approvals",
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: [
      {
        subsystemKey: "api",
        key: SUBMIT,
        kind: "operation",
        roles: ["interface", "behavior"],
        name: SUBMIT,
        evidence: [{ file: "routes.py", line: 10, symbol: "submit_request" }],
        claimState: "observed",
        capability: "api.operation",
      },
      {
        subsystemKey: "api",
        key: DELETE,
        kind: "operation",
        roles: ["interface", "behavior"],
        name: DELETE,
        evidence: [{ file: deleteHandlerFile, line: 40, symbol: deleteSymbol }],
        claimState: "observed",
        capability: "api.operation",
      },
    ],
  });
}

function seed() {
  return {
    formatVersion: 3,
    system: { id: "purchase", name: "Purchase approvals" },
    concepts: [
      { id: "behavior.submit-request", role: "behavior", name: "Submit request" },
      { id: "behavior.delete-request", role: "behavior", name: "Delete request" },
    ],
    commitments: [],
    surfaces: [
      {
        id: "surface.submit-request-api",
        name: "Submit purchase request API",
        behavior: "behavior.submit-request",
        channel: "api",
        access: "authenticated",
      },
    ],
    scenarios: [],
    context: [],
  };
}

function wit(seedHash, surfaceBindings) {
  return {
    formatVersion: 2,
    seedHash,
    bindings: [],
    surfaceBindings,
    witnesses: [],
  };
}

test("adversary 1: unauthenticated DELETE is unaccounted even when submit is bound", () => {
  const model = purchaseModel();
  const s = seed();
  const seedHash = seedContentHash(s);
  const report = reconcile({
    model,
    seed: s,
    realization: wit(seedHash, [{
      id: "surface-binding.submit-request-api",
      surface: "surface.submit-request-api",
      artifact: { lens: "api", kind: "operation", key: SUBMIT },
    }]),
  });
  assert.equal(report.surfaces.accounted.length, 1);
  assert.equal(report.surfaces.unaccounted.length, 1);
  assert.equal(report.surfaces.unaccounted[0].key, DELETE);
  const gate = evaluateBuildGate({
    startModel: model, completionModel: model, startReport: report, completionReport: report,
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
});

test("adversary 2: pointing expected surface at DELETE leaves intended submit unaccounted — no green", () => {
  const model = purchaseModel();
  const s = seed();
  const seedHash = seedContentHash(s);
  const report = reconcile({
    model,
    seed: s,
    realization: wit(seedHash, [{
      id: "surface-binding.submit-request-api",
      surface: "surface.submit-request-api",
      artifact: { lens: "api", kind: "operation", key: DELETE },
    }]),
  });
  // The only expected surface is bound to DELETE, so SUBMIT is unaccounted.
  assert.ok(report.surfaces.unaccounted.some((item) => item.key === SUBMIT));
  assert.ok(report.surfaces.accounted.some((item) => item.key === DELETE)
    || report.surfaces.accounted.some((item) => {
      const el = model.elements.find((e) => e.id === item.elementId);
      return el?.key === DELETE;
    }));
  // Not green: either unaccounted submit or the product surface no longer names submit.
  assert.ok(
    report.surfaces.unaccounted.length > 0
      || report.surfaces.missing.length > 0
      || report.surfaces.ambiguous.length > 0,
  );
  const gate = evaluateBuildGate({
    startModel: model, completionModel: model, startReport: report, completionReport: report,
  });
  assert.notEqual(gate.state, GATE_STATES.READY);
});

test("adversary 3: two surfaces bound to one route are ambiguous", () => {
  const model = purchaseModel();
  const s = {
    ...seed(),
    surfaces: [
      ...seed().surfaces,
      {
        id: "surface.delete-request-api",
        name: "Delete purchase request API",
        behavior: "behavior.delete-request",
        channel: "api",
        access: "authenticated",
      },
    ],
  };
  const seedHash = seedContentHash(s);
  const report = reconcile({
    model,
    seed: s,
    realization: wit(seedHash, [
      {
        id: "surface-binding.submit-request-api",
        surface: "surface.submit-request-api",
        artifact: { lens: "api", kind: "operation", key: SUBMIT },
      },
      {
        id: "surface-binding.delete-request-api",
        surface: "surface.delete-request-api",
        artifact: { lens: "api", kind: "operation", key: SUBMIT },
      },
    ]),
  });
  assert.ok(report.surfaces.ambiguous.length >= 1);
  assert.equal(report.surfaces.accounted.length, 0);
  const gate = evaluateBuildGate({
    startModel: model, completionModel: model, startReport: report, completionReport: report,
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.ok(gate.reasons.some((reason) => reason.includes("ambiguous-surface")));
});

test("adversary 4: renaming/moving a handler without changing the public key keeps the binding", () => {
  const before = purchaseModel({ deleteHandlerFile: "routes.py", deleteSymbol: "delete_request" });
  const after = purchaseModel({ deleteHandlerFile: "handlers/purchase.py", deleteSymbol: "remove_purchase_request" });
  const s = {
    ...seed(),
    surfaces: [
      {
        id: "surface.delete-request-api",
        name: "Delete purchase request API",
        behavior: "behavior.delete-request",
        channel: "api",
        access: "authenticated",
      },
    ],
  };
  const seedHash = seedContentHash(s);
  const realization = wit(seedHash, [{
    id: "surface-binding.delete-request-api",
    surface: "surface.delete-request-api",
    artifact: { lens: "api", kind: "operation", key: DELETE },
  }]);

  const beforeResolution = resolveSurfaceBindings(before, realization, seedHash);
  const afterResolution = resolveSurfaceBindings(after, realization, seedHash);
  assert.equal(beforeResolution.get("surface-binding.delete-request-api").state, "resolved");
  assert.equal(afterResolution.get("surface-binding.delete-request-api").state, "resolved");
  assert.equal(
    beforeResolution.get("surface-binding.delete-request-api").elementIds[0],
    after.elements.find((el) => el.key === DELETE) && afterResolution.get("surface-binding.delete-request-api").elementIds[0]
      ? afterResolution.get("surface-binding.delete-request-api").elementIds[0]
      : beforeResolution.get("surface-binding.delete-request-api").elementIds[0],
  );
  // Public key identity is stable across rename — same key resolves both models.
  assert.equal(
    before.elements.find((el) => el.key === DELETE).key,
    after.elements.find((el) => el.key === DELETE).key,
  );
  const afterReport = reconcile({ model: after, seed: s, realization });
  assert.equal(afterReport.surfaces.accounted.length, 1);
  assert.equal(afterReport.surfaces.stale.length, 0);
  assert.equal(afterReport.surfaces.missing.length, 0);
});

test("missing and stale surface bindings also block ready", () => {
  const model = purchaseModel();
  const s = seed();
  const seedHash = seedContentHash(s);

  const missingReport = reconcile({
    model,
    seed: s,
    realization: wit(seedHash, []),
  });
  assert.ok(missingReport.surfaces.missing.length > 0);
  assert.equal(
    evaluateBuildGate({
      startModel: model, completionModel: model,
      startReport: missingReport, completionReport: missingReport,
    }).state,
    GATE_STATES.NEEDS_ATTENTION,
  );

  const staleReport = reconcile({
    model,
    seed: s,
    realization: wit(seedHash, [{
      id: "surface-binding.submit-request-api",
      surface: "surface.submit-request-api",
      artifact: { lens: "api", kind: "operation", key: "POST /gone" },
    }]),
  });
  assert.ok(staleReport.surfaces.stale.length > 0);
  assert.equal(
    evaluateBuildGate({
      startModel: model, completionModel: model,
      startReport: staleReport, completionReport: staleReport,
    }).state,
    GATE_STATES.NEEDS_ATTENTION,
  );
});
