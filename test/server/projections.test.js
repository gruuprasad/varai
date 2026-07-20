import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemModel } from "../../src/system-model/build.js";
import { serializeProjections } from "../../src/server/projections.js";

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

test("server projection payload includes experimental region and observed-area views", () => {
  const model = buildSystemModel(draft(), { systemName: "server-projection-fixture" });
  const payload = serializeProjections(model);
  assert.equal(payload.things.kind, "browse-by-thing");
  assert.equal(payload.envelopes.kind, "behavioral-envelopes");
  assert.equal(payload.regionCandidates.kind, "semantic-region-candidates");
  assert.equal(payload.observedAreas.kind, "observed-areas");
  assert.ok(payload.observedAreas.areas.length >= 2);
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
