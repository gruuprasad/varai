import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemModel } from "../../src/system-model/build.js";
import { semanticRegionCandidates } from "../../src/system-model/projections/index.js";

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

function regionDraft({ secondUsesCore = true, names = {} } = {}) {
  const ui = (kind, key, fallback, roles) => element("ui", kind, key, names[key] ?? fallback, roles);
  const api = (key, fallback) => element("api", "operation", key, names[key] ?? fallback, ["interface", "behavior"]);
  const data = (kind, key, fallback) => element("data", kind, key, names[key] ?? fallback, ["resource"]);
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
      claim(source("api", "operation", operations[index]), index % 2 ? "reads" : "changes",
        reference("data", "aggregate", side === "a" ? "specific-a" : "specific-b"), `specific-${index}`),
      claim(source("api", "operation", operations[index]), "accepts", reference("data", "contract", "shared-contract"), "input"),
    );
    if (side === "a" || secondUsesCore) claims.push(
      claim(source("api", "operation", operations[index]), index % 2 ? "reads" : "changes",
        reference("data", "aggregate", "shared-core"), `core-${index}`));
  }
  claims.push(claim(source("api", "operation", operations[1]), "produces",
    reference("data", "artifact", "specific-artifact-a"), "artifact"));

  return {
    subsystems: [subsystem("ui", "ui", "UI"), subsystem("api", "api", "API"), subsystem("data", "data", "Data")],
    elements: [
      ui("screen", "screen-a", "Workspace Alpha", ["interface"]),
      ui("screen", "screen-b", "Workspace Beta", ["interface"]),
      ui("surface", "surface-a", "Alpha Tools", ["interface"]),
      ui("surface", "surface-b", "Beta Tools", ["interface"]),
      ...actions.map((key) => ui("action", key, key, ["behavior"])),
      ...operations.map((key) => api(key, key)),
      data("aggregate", "shared-core", "Shared Document"),
      data("aggregate", "specific-a", "Alpha State"),
      data("aggregate", "specific-b", "Beta State"),
      data("artifact", "specific-artifact-a", "Alpha Export"),
      data("contract", "shared-contract", "Shared Request"),
    ],
    claims,
  };
}

function projection(options) {
  return semanticRegionCandidates(buildSystemModel(regionDraft(options), { systemName: "region-fixture" }));
}

function anchorNameMap(model) { return new Map(model.elements.map((item) => [item.id, item.name])); }

test("distinct interaction parents reuse one shared core without merging", () => {
  const model = buildSystemModel(regionDraft(), { systemName: "region-fixture" });
  const value = semanticRegionCandidates(model);
  const names = anchorNameMap(model);
  const interaction = value.regions.filter((item) => item.basis === "interaction-context");
  const screens = interaction.filter((item) => names.get(item.anchorElementIds[0])?.startsWith("Workspace"));
  const surfaces = interaction.filter((item) => names.get(item.anchorElementIds[0])?.endsWith("Tools"));
  const cores = value.regions.filter((item) => item.basis === "shared-resource-core");

  assert.equal(screens.length, 2);
  assert.equal(cores.length, 1, "parent-local Resources and shared contracts must not become shared cores");
  assert.equal(names.get(cores[0].anchorElementIds[0]), "Shared Document");
  assert.equal(intersection(screens[0].envelopeIds, screens[1].envelopeIds).length, 0,
    "parents remain distinct rather than unioning through the shared core");
  for (const surface of surfaces) assert.ok(value.relationships.some((item) =>
    item.relation === "uses" && item.sourceRegionId === surface.id && item.targetRegionId === cores[0].id));
  assert.equal(value.relationships.some((item) =>
    item.relation === "contains" && item.targetRegionId === cores[0].id), false);
});

test("canonical containment creates nested parents without manufacturing cross-branch reuse", () => {
  const model = buildSystemModel(regionDraft(), { systemName: "region-fixture" });
  const value = semanticRegionCandidates(model);
  const names = anchorNameMap(model);
  const contains = value.relationships.filter((item) => item.relation === "contains");
  assert.equal(contains.length, 2);
  for (const item of contains) {
    assert.ok(names.get(value.regions.find((region) => region.id === item.sourceRegionId).anchorElementIds[0]).startsWith("Workspace"));
    assert.ok(names.get(value.regions.find((region) => region.id === item.targetRegionId).anchorElementIds[0]).endsWith("Tools"));
  }
  assert.equal(value.regions.some((item) => item.basis === "shared-resource-core" &&
    names.get(item.anchorElementIds[0]) === "Alpha State"), false);
});

test("removing one independent parent's effects removes the shared core instead of merging parents", () => {
  const before = projection();
  const after = projection({ secondUsesCore: false });
  assert.equal(before.regions.filter((item) => item.basis === "shared-resource-core").length, 1);
  assert.equal(after.regions.filter((item) => item.basis === "shared-resource-core").length, 0);
  assert.equal(after.regions.filter((item) => item.basis === "interaction-context").length, 4);
  assert.equal(after.relationships.filter((item) => item.relation === "uses").length, 0);
});

test("region candidates ignore display names, collection order, and private evidence movement", () => {
  const model = buildSystemModel(regionDraft(), { systemName: "region-fixture" });
  const renamed = buildSystemModel(regionDraft({ names: {
    "screen-a": "Area One", "screen-b": "Area Two", "surface-a": "Controls One", "surface-b": "Controls Two",
    "shared-core": "Central Record",
  }}), { systemName: "region-fixture" });
  const reordered = {
    ...model,
    subsystems: [...model.subsystems].reverse(),
    elements: [...model.elements].reverse(),
    claims: [...model.claims].reverse().map((item) => ({
      ...item,
      evidence: [{ file: "moved/private.js", line: 99 }],
      implementationPath: [{ file: "moved/private.js", line: 100 }],
    })),
  };
  assert.deepEqual(semanticRegionCandidates(renamed), semanticRegionCandidates(model));
  assert.deepEqual(semanticRegionCandidates(reordered), semanticRegionCandidates(model));
});

test("unsupported singleton contexts remain explicit diagnostics", () => {
  const draft = regionDraft();
  draft.claims = draft.claims.filter((item) => item.slot !== "offer-a-two");
  const value = semanticRegionCandidates(buildSystemModel(draft, { systemName: "region-fixture" }));
  assert.ok(value.diagnostics.some((item) => item.reason === "no-supported-interaction-context"));
});

test("a repeated Resource reference without a resolved effect does not create a shared core", () => {
  const draft = regionDraft({ secondUsesCore: false });
  draft.claims = draft.claims.filter((item) => !String(item.slot).startsWith("core-"));
  for (const [index, operation] of ["POST /a/one", "POST /b/one"].entries()) {
    draft.claims.push(claim(source("api", "operation", operation), "accepts",
      reference("data", "aggregate", "shared-core"), `non-effect-reference-${index}`));
  }
  const model = buildSystemModel(draft, { systemName: "region-fixture" });
  const names = anchorNameMap(model);
  const value = semanticRegionCandidates(model);
  assert.equal(value.regions.some((item) => item.basis === "shared-resource-core" &&
    item.anchorElementIds.some((id) => names.get(id) === "Shared Document")), false);
});

function intersection(left, right) {
  const values = new Set(right);
  return left.filter((item) => values.has(item));
}
