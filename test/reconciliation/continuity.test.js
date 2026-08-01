import assert from "node:assert/strict";
import test from "node:test";
import { projectContinuity } from "../../src/reconciliation/continuity.js";
import { seedContentHash } from "../../src/seed/identity.js";

function element(id, key, kind, subsystemId = "api") {
  return { id, subsystemId, subsystemKey: subsystemId, key, kind, name: key, roles: ["behavior"], qualifiers: {}, evidence: [{ file: "app.py", line: 1 }], claimState: "observed" };
}

function model(elements) {
  return {
    system: { id: "demo", key: "demo", name: "Demo" },
    subsystems: [{ id: "api", key: "api", lens: "api", name: "API", qualifiers: {}, evidence: [] }],
    elements,
    claims: [],
    coverage: [],
  };
}

function seed() {
  return {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.submit-request", role: "behavior", name: "Submit" },
      { id: "behavior.withdraw-request", role: "behavior", name: "Withdraw" },
      { id: "resource.request", role: "resource", name: "Request" },
    ],
    commitments: [],
    surfaces: [],
    scenarios: [],
    context: [],
    ratification: { status: "ratified", contentHash: "sha256:" + "0".repeat(64) },
  };
}

function realization(seedDoc, bindings) {
  return { formatVersion: 2, seedHash: seedContentHash(seedDoc), bindings, surfaceBindings: [], witnesses: [] };
}

const binding = (id, concept, key, kind = "operation") => ({ id, concept, artifact: { lens: "api", kind, key } });

test("no prior ready baseline reports an explicit absent state", () => {
  const result = projectContinuity({
    currentModel: model([element("el:submit", "POST /requests", "operation")]),
    currentSeed: seed(),
    currentRealization: realization(seed(), [binding("binding.submit", "behavior.submit-request", "POST /requests")]),
  });
  assert.equal(result.present, false);
  assert.deepEqual(result.summary, { carried: 0, rebound: 0, new: 0, unresolvable: 0 });
});

test("unchanged mappings report carried", () => {
  const seedDoc = seed();
  const before = model([element("el:submit", "POST /requests", "operation")]);
  const after = model([element("el:submit", "POST /requests", "operation")]);
  const priorRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const currentRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const result = projectContinuity({
    currentModel: after,
    currentSeed: seedDoc,
    currentRealization,
    priorModel: before,
    priorSeed: seedDoc,
    priorRealization,
  });
  assert.equal(result.present, true);
  assert.equal(result.summary.carried, 1);
  assert.equal(result.summary.rebound, 0);
  assert.equal(result.entries[0].state, "carried");
});

test("rebinding to a still-present old element reports rebound with its fate", () => {
  const seedDoc = seed();
  const before = model([element("el:old", "POST /requests", "operation")]);
  const after = model([
    element("el:old", "POST /requests", "operation"),
    element("el:new", "POST /orders", "operation"),
  ]);
  const priorRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const currentRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /orders")]);
  const result = projectContinuity({
    currentModel: after,
    currentSeed: seedDoc,
    currentRealization,
    priorModel: before,
    priorSeed: seedDoc,
    priorRealization,
  });
  assert.equal(result.summary.rebound, 1);
  assert.equal(result.summary.carried, 0);
  const entry = result.entries.find((item) => item.id === "binding.submit");
  assert.equal(entry.state, "rebound");
  assert.deepEqual(entry.to, ["el:new"]);
  assert.deepEqual(entry.oldElementFates, [{ elementId: "el:old", fate: "still-present" }]);
});

test("a removed old element reports fate gone", () => {
  const seedDoc = seed();
  const before = model([element("el:old", "POST /requests", "operation")]);
  const after = model([element("el:new", "POST /orders", "operation")]);
  const priorRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const currentRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /orders")]);
  const result = projectContinuity({
    currentModel: after,
    currentSeed: seedDoc,
    currentRealization,
    priorModel: before,
    priorSeed: seedDoc,
    priorRealization,
  });
  const entry = result.entries.find((item) => item.id === "binding.submit");
  assert.equal(entry.state, "rebound");
  assert.deepEqual(entry.oldElementFates, [{ elementId: "el:old", fate: "gone" }]);
});

test("an old element with the same key in a new id reports fate renamed", () => {
  const seedDoc = seed();
  const before = model([element("el:old", "POST /requests", "operation")]);
  const after = model([element("el:new", "POST /requests", "operation")]);
  const priorRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const currentRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const result = projectContinuity({
    currentModel: after,
    currentSeed: seedDoc,
    currentRealization,
    priorModel: before,
    priorSeed: seedDoc,
    priorRealization,
  });
  const entry = result.entries.find((item) => item.id === "binding.submit");
  assert.equal(entry.state, "rebound");
  assert.deepEqual(entry.oldElementFates, [{ elementId: "el:old", fate: "renamed" }]);
});


test("newly bound concepts and unresolvable bindings are reported separately", () => {
  const seedDoc = seed();
  const before = model([element("el:submit", "POST /requests", "operation")]);
  const after = model([
    element("el:submit", "POST /requests", "operation"),
    element("el:withdraw", "POST /requests/{id}/withdraw", "operation"),
  ]);
  const priorRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const currentRealization = realization(seedDoc, [
    binding("binding.submit", "behavior.submit-request", "POST /requests"),
    binding("binding.withdraw", "behavior.withdraw-request", "POST /requests/{id}/withdraw"),
    binding("binding.ghost", "behavior.submit-request", "POST /does-not-exist"),
  ]);
  const result = projectContinuity({
    currentModel: after,
    currentSeed: seedDoc,
    currentRealization,
    priorModel: before,
    priorSeed: seedDoc,
    priorRealization,
  });
  assert.equal(result.summary.carried, 1);
  assert.equal(result.summary.rebound, 0);
  assert.equal(result.summary.new, 1);
  assert.equal(result.summary.unresolvable, 1);
  assert.equal(result.entries.find((item) => item.id === "binding.withdraw").state, "new");
  assert.equal(result.entries.find((item) => item.id === "binding.ghost").state, "unresolvable");
});

test("continuity is deterministic", () => {
  const seedDoc = seed();
  const before = model([element("el:old", "POST /requests", "operation")]);
  const after = model([element("el:old", "POST /requests", "operation"), element("el:new", "POST /orders", "operation")]);
  const priorRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /requests")]);
  const currentRealization = realization(seedDoc, [binding("binding.submit", "behavior.submit-request", "POST /orders")]);
  const inputs = {
    currentModel: after, currentSeed: seedDoc, currentRealization,
    priorModel: before, priorSeed: seedDoc, priorRealization,
  };
  assert.equal(JSON.stringify(projectContinuity(inputs)), JSON.stringify(projectContinuity(inputs)));
});
