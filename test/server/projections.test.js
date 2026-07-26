import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemModel } from "../../src/system-model/build.js";
import { serializeProjections } from "../../src/server/projections.js";
import { archUnits } from "../../src/system-model/projections/index.js";

const evidence = (file = "system.js", line = 1) => [{ file, line }];
const subsystem = (key, lens, name) => ({ key, lens, name, qualifiers: {}, evidence: [] });
const element = (subsystemKey, kind, key, name, roles) => ({
  subsystemKey, kind, key, name, roles, qualifiers: {}, evidence: evidence(),
  observationMethod: "semantic", claimState: "observed", capability: `${subsystemKey}.${kind}`,
});
const source = (subsystemKey, elementKind, key) => ({ kind: "element", subsystemKey, elementKind, key });
const reference = (subsystemKey, elementKind, key) => ({
  kind: "reference", reference: source(subsystemKey, elementKind, key),
});
const literal = (valueType, value) => ({ kind: "literal", valueType, value });
const claim = (from, relation, target, slot) => ({
  source: from, relation, target, slot, qualifiers: {}, evidence: evidence(), implementationPath: evidence(),
  observationMethod: "semantic", claimState: "observed", capability: `fixture.${relation}`,
});

function draft() {
  const actions = ["a-one", "a-two", "b-one", "b-two"];
  const operations = ["POST /a/one", "POST /a/two", "POST /b/one", "POST /b/two"];
  const claims = [
    claim(source("ui", "screen", "screen-a"), "contains", reference("ui", "surface", "surface-a"), "surface-a"),
    claim(source("ui", "screen", "screen-b"), "contains", reference("ui", "surface", "surface-b"), "surface-b"),
  ];
  for (let index = 0; index < actions.length; index += 1) {
    const side = index < 2 ? "a" : "b";
    claims.push(
      claim(source("ui", "surface", `surface-${side}`), "offers", reference("ui", "action", actions[index]), `offer-${actions[index]}`),
      claim(source("ui", "action", actions[index]), "triggered_by", literal("event", "submit"), "trigger"),
      claim(source("ui", "action", actions[index]), "invokes", reference("api", "operation", operations[index]), `invoke-${index}`),
      claim(source("api", "operation", operations[index]), "changes",
        reference("data", "aggregate", "shared-core"), `core-${index}`),
    );
  }
  return {
    subsystems: [
      subsystem("ui", "ui", "UI"),
      subsystem("api", "api", "API"),
      subsystem("data", "data", "Data"),
    ],
    elements: [
      element("ui", "screen", "screen-a", "Workspace Alpha", ["interface"]),
      element("ui", "screen", "screen-b", "Workspace Beta", ["interface"]),
      element("ui", "surface", "surface-a", "Alpha Tools", ["interface"]),
      element("ui", "surface", "surface-b", "Beta Tools", ["interface"]),
      ...actions.map((key) => element("ui", "action", key, key, ["behavior"])),
      ...operations.map((key) => element("api", "operation", key, key, ["interface", "behavior"])),
      element("data", "aggregate", "shared-core", "Shared Document", ["resource"]),
    ],
    claims,
  };
}

test("server projection payload includes core mechanism-axis views without subject-axis defaults", () => {
  const model = buildSystemModel(draft(), { systemName: "server-projection-fixture" });
  const payload = serializeProjections(model);
  assert.equal(payload.things.kind, "browse-by-thing");
  assert.equal(payload.envelopes.kind, "behavioral-envelopes");
  assert.equal(payload.archUnits.kind, "arch-units");
  assert.equal("regionCandidates" in payload, false);
  assert.equal("observedAreas" in payload, false);
  assert.deepEqual(serializeProjections(model), payload);
});

test("server projection payload stays deterministic under collection reordering", () => {
  const model = buildSystemModel(draft(), { systemName: "server-projection-fixture" });
  const reordered = {
    ...model,
    elements: [...model.elements].reverse(),
    claims: [...model.claims].reverse(),
  };
  assert.deepEqual(serializeProjections(reordered), serializeProjections(model));
});

// Grain choice is load-bearing, not cosmetic. `subsystem` groups by technology
// lens (api / data / ui / …), so an import edge between two API operations is
// intra-unit and gets dropped. `module` is the grain at which observed
// dependency edges survive, so it is the grain the dashboard is served.
function archDraft() {
  return {
    subsystems: [subsystem("api", "api", "API")],
    elements: [
      {
        subsystemKey: "api", kind: "operation", key: "GET /orders", name: "GET /orders",
        roles: ["interface", "behavior"], qualifiers: {}, evidence: evidence("app/orders.py", 3),
        observationMethod: "ast", claimState: "observed", capability: "api.operation",
      },
      {
        subsystemKey: "api", kind: "operation", key: "GET /users", name: "GET /users",
        roles: ["interface", "behavior"], qualifiers: {}, evidence: evidence("app/users.py", 3),
        observationMethod: "ast", claimState: "observed", capability: "api.operation",
      },
    ],
    claims: [{
      source: source("api", "operation", "GET /orders"),
      relation: "depends_on",
      target: reference("api", "operation", "GET /users"),
      slot: "depends_on:GET /users",
      qualifiers: {}, evidence: evidence("app/orders.py", 13), implementationPath: [],
      observationMethod: "ast", claimState: "observed", capability: "arch.dependency",
    }],
  };
}

test("server serializes arch units at module grain", () => {
  const model = buildSystemModel(archDraft(), { systemName: "arch-grain-fixture" });
  const payload = serializeProjections(model);
  assert.equal(payload.archUnits.grain, "module");
});

test("the serialized arch-unit grain preserves observed dependency edges", () => {
  const model = buildSystemModel(archDraft(), { systemName: "arch-grain-fixture" });
  const payload = serializeProjections(model);
  assert.equal(payload.archUnits.edges.length, 1);
  assert.deepEqual(
    payload.archUnits.edges.map((edge) => `${edge.fromUnitId}->${edge.toUnitId}`),
    ["module:app/orders.py->module:app/users.py"],
  );
  // The regression this guards: at subsystem grain both operations share the
  // "api" lens, so this same edge collapses to nothing.
  assert.equal(archUnits(model, { grain: "subsystem" }).edges.length, 0);
});
