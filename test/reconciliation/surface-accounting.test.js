import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { resolveSurfaceBindings } from "../../src/reconciliation/resolve.js";
import { accountSurfaces } from "../../src/reconciliation/surface.js";
import { isPublicSurfaceElement, publicSurfaceElements } from "../../src/reconciliation/public-surfaces.js";
import { seedContentHash } from "../../src/seed/identity.js";

function apiModel(operations) {
  return createSystemModel({
    systemName: "surfaces-fixture",
    subsystems: [
      { key: "api", lens: "api", name: "API" },
      { key: "application", lens: "application", name: "Application" },
      { key: "data", lens: "data", name: "Data" },
      { key: "ui", lens: "ui", name: "UI" },
      { key: "cli", lens: "cli", name: "CLI" },
    ],
    elements: [
      ...operations.map((key) => ({
        subsystemKey: "api",
        key,
        kind: "operation",
        roles: ["interface", "behavior"],
        name: key,
        evidence: [{ file: "routes.py", line: 1, symbol: key.replace(/\W+/g, "_") }],
        claimState: "observed",
        capability: "api.operation",
      })),
      {
        subsystemKey: "application",
        key: "helper.save",
        kind: "operation",
        roles: ["behavior"],
        name: "save helper",
        evidence: [{ file: "domain.py", line: 10, symbol: "save" }],
        claimState: "observed",
        capability: "application.operation",
      },
      {
        subsystemKey: "data",
        key: "PurchaseRequest",
        kind: "entity",
        roles: ["resource"],
        name: "PurchaseRequest",
        evidence: [{ file: "models.py", line: 1, symbol: "PurchaseRequest" }],
        claimState: "observed",
        capability: "data.entity",
      },
      {
        subsystemKey: "ui",
        key: "SubmitForm",
        kind: "screen",
        roles: ["interface"],
        name: "SubmitForm",
        evidence: [{ file: "SubmitForm.tsx", line: 1 }],
        claimState: "observed",
        capability: "ui.screen",
      },
      {
        subsystemKey: "ui",
        key: "SubmitForm:click:submit",
        kind: "action",
        roles: ["behavior"],
        name: "SubmitForm submit",
        evidence: [{ file: "SubmitForm.tsx", line: 20 }],
        claimState: "observed",
        capability: "ui.action",
      },
      {
        subsystemKey: "cli",
        key: "npm:build",
        kind: "command",
        roles: ["interface", "behavior"],
        name: "build",
        evidence: [{ file: "package.json", line: 5 }],
        claimState: "observed",
        capability: "cli.command",
      },
    ],
  });
}

function v3Seed(surfaces) {
  return {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.submit", role: "behavior", name: "Submit" },
      { id: "behavior.approve", role: "behavior", name: "Approve" },
    ],
    commitments: [],
    surfaces,
    scenarios: [],
    context: [],
    ratification: { status: "ratified", ratifiedAt: "2026-07-28T00:00:00.000Z", contentHash: "pending" },
  };
}

function realization(seedHash, surfaceBindings, bindings = []) {
  return {
    formatVersion: 2,
    seedHash,
    bindings,
    surfaceBindings,
    witnesses: [],
  };
}

function surfaceBinding(id, surface, artifact) {
  return { id, surface, artifact };
}

test("public-surface contract includes api ops, screens, actions, and cli commands — not helpers or entities", () => {
  const model = apiModel(["POST /api/requests"]);
  const lensOf = new Map(model.subsystems.map((s) => [s.id, s.lens]));
  const publicIds = new Set(publicSurfaceElements(model).map((el) => el.id));

  for (const element of model.elements) {
    const lens = lensOf.get(element.subsystemId);
    const isPublic = isPublicSurfaceElement(element, { lens });
    if (element.capability === "api.operation") assert.equal(isPublic, true);
    else if (element.capability === "ui.screen") assert.equal(isPublic, true);
    else if (element.capability === "ui.action") assert.equal(isPublic, true);
    else if (element.capability === "cli.command") assert.equal(isPublic, true);
    else assert.equal(isPublic, false, `${element.kind}/${element.capability} must not be public`);
    assert.equal(publicIds.has(element.id), isPublic);
  }
});

test("v1/v2 seeds without surfaces array yield cannot_account, not a clean empty unaccounted set", () => {
  const model = apiModel(["POST /api/requests", "DELETE /api/requests/{id}"]);
  const seed = {
    formatVersion: 2,
    system: { id: "demo", name: "Demo" },
    concepts: [{ id: "behavior.submit", role: "behavior", name: "Submit" }],
    commitments: [],
    context: [],
  };
  const surfaces = accountSurfaces({ model, seed, realization: null });
  assert.equal(surfaces.state, "cannot_account");
  assert.equal(surfaces.reason, "seed-surfaces-absent");
  assert.deepEqual(surfaces.expected, []);
  assert.deepEqual(surfaces.unaccounted, [], "must not list observed routes as unaccounted when the world is not closed");
  assert.ok(publicSurfaceElements(model).length >= 2, "fixture still has rich public surface");
});

test("Seed v3 with empty surfaces and observed public Elements yields unaccounted", () => {
  const model = apiModel(["POST /api/requests"]);
  const seed = v3Seed([]);
  const surfaces = accountSurfaces({ model, seed, realization: null });
  assert.equal(surfaces.state, "closed");
  assert.equal(surfaces.expected.length, 0);
  assert.equal(surfaces.unaccounted.length, publicSurfaceElements(model).length);
  assert.ok(surfaces.unaccounted.some((item) => item.key === "POST /api/requests"));
});

test("a resolved surfaceBinding accounts exactly one public Element", () => {
  const model = apiModel(["POST /api/requests"]);
  const seed = v3Seed([{
    id: "surface.submit-api",
    name: "Submit request API",
    behavior: "behavior.submit",
    channel: "api",
    access: "authenticated",
  }]);
  const seedHash = seedContentHash(seed);
  const op = model.elements.find((el) => el.key === "POST /api/requests");
  const wit = realization(seedHash, [
    surfaceBinding("surface-binding.submit-api", "surface.submit-api", {
      lens: "api", kind: "operation", key: "POST /api/requests",
    }),
  ]);
  const resolution = resolveSurfaceBindings(model, wit, seedHash);
  assert.equal(resolution.get("surface-binding.submit-api").state, "resolved");
  assert.deepEqual(resolution.get("surface-binding.submit-api").elementIds, [op.id]);

  const surfaces = accountSurfaces({ model, seed, realization: wit, surfaceResolution: resolution });
  assert.equal(surfaces.state, "closed");
  assert.equal(surfaces.accounted.length, 1);
  assert.equal(surfaces.accounted[0].surfaceId, "surface.submit-api");
  assert.equal(surfaces.accounted[0].elementId, op.id);
  assert.deepEqual(surfaces.missing, []);
  assert.deepEqual(surfaces.ambiguous, []);
  assert.deepEqual(surfaces.stale, []);
  // screen/action/cli still unaccounted
  assert.ok(surfaces.unaccounted.every((item) => item.elementId !== op.id));
});

test("concept bindings alone do not account a public Element", () => {
  const model = apiModel(["POST /api/requests"]);
  const seed = v3Seed([{
    id: "surface.submit-api",
    name: "Submit request API",
    behavior: "behavior.submit",
    channel: "api",
    access: "authenticated",
  }]);
  const seedHash = seedContentHash(seed);
  const wit = realization(seedHash, [], [
    { id: "binding.submit", concept: "behavior.submit", artifact: { lens: "api", kind: "operation", key: "POST /api/requests" } },
  ]);
  const surfaces = accountSurfaces({ model, seed, realization: wit });
  assert.equal(surfaces.accounted.length, 0);
  assert.ok(surfaces.missing.some((item) => item.surfaceId === "surface.submit-api"));
  assert.ok(surfaces.unaccounted.some((item) => item.key === "POST /api/requests"));
});

test("reconcile attaches a top-level surfaces section", () => {
  const model = apiModel(["POST /api/requests"]);
  const seed = v3Seed([]);
  const report = reconcile({ model, seed, realization: null });
  assert.ok(report.surfaces);
  assert.equal(report.surfaces.state, "closed");
  assert.ok(report.surfaces.unaccounted.length > 0);
  assert.ok(report.summary.surfaces);
  assert.equal(report.summary.surfaces.unaccounted, report.surfaces.unaccounted.length);
});
