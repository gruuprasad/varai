import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemModel } from "../../src/system-model/build.js";
import { observedAreas, semanticRegionCandidates } from "../../src/system-model/projections/index.js";

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

function regionDraft({ secondUsesCore = true, names = {}, singleton = false } = {}) {
  const ui = (kind, key, fallback, roles) => element("ui", kind, key, names[key] ?? fallback, roles);
  const api = (key, fallback) => element("api", "operation", key, names[key] ?? fallback, ["interface", "behavior"]);
  const data = (kind, key, fallback) => element("data", kind, key, names[key] ?? fallback, ["resource"]);
  const actions = singleton ? ["a-one"] : ["a-one", "a-two", "b-one", "b-two"];
  const operations = singleton
    ? ["POST /a/one"]
    : ["POST /a/one", "POST /a/two", "POST /b/one", "POST /b/two"];
  const claims = [
    claim(source("ui", "screen", "screen-a"), "contains", reference("ui", "surface", "surface-a"), "surface-a"),
  ];
  if (!singleton) {
    claims.push(claim(source("ui", "screen", "screen-b"), "contains", reference("ui", "surface", "surface-b"), "surface-b"));
  }
  for (let index = 0; index < actions.length; index += 1) {
    const side = index < 2 || singleton ? "a" : "b";
    claims.push(
      claim(source("ui", "surface", `surface-${side}`), "offers", reference("ui", "action", actions[index]), `offer-${actions[index]}`),
      claim(source("ui", "action", actions[index]), "triggered_by", literal("event", "submit"), "trigger"),
      claim(source("ui", "action", actions[index]), "invokes", reference("api", "operation", operations[index]), `invoke-${index}`),
      claim(source("api", "operation", operations[index]), index % 2 ? "reads" : "changes",
        reference("data", "aggregate", side === "a" ? "specific-a" : "specific-b"), `specific-${index}`),
      claim(source("api", "operation", operations[index]), "accepts", reference("data", "contract", "shared-contract"), "input"),
    );
    if (side === "a" || secondUsesCore) {
      claims.push(claim(source("api", "operation", operations[index]), index % 2 ? "reads" : "changes",
        reference("data", "aggregate", "shared-core"), `core-${index}`));
    }
  }
  if (!singleton) {
    claims.push(claim(source("api", "operation", operations[1]), "produces",
      reference("data", "artifact", "specific-artifact-a"), "artifact"));
    claims.push(claim(source("api", "operation", operations[1]), "fails_with",
      literal("condition", "preview is stale"), "stale"));
  }

  const elements = [
    ui("screen", "screen-a", "Workspace Alpha", ["interface"]),
    ui("surface", "surface-a", "Alpha Tools", ["interface"]),
    ...actions.map((key) => ui("action", key, key, ["behavior"])),
    ...operations.map((key) => api(key, key)),
    data("aggregate", "shared-core", "Shared Document"),
    data("aggregate", "specific-a", "Alpha State"),
    data("contract", "shared-contract", "Shared Request"),
  ];
  if (!singleton) {
    elements.push(
      ui("screen", "screen-b", "Workspace Beta", ["interface"]),
      ui("surface", "surface-b", "Beta Tools", ["interface"]),
      data("aggregate", "specific-b", "Beta State"),
      data("artifact", "specific-artifact-a", "Alpha Export"),
    );
  }
  return {
    subsystems: [subsystem("ui", "ui", "UI"), subsystem("api", "api", "API"), subsystem("data", "data", "Data")],
    elements,
    claims,
  };
}

function projection(options) {
  return observedAreas(buildSystemModel(regionDraft(options), { systemName: "observed-areas-fixture" }));
}

function assertNoInventedLabels(value) {
  const forbidden = ["Authoring", "Project Management", "domain", "bounded context", "feature area"];
  const blob = JSON.stringify(value);
  for (const word of forbidden) {
    assert.equal(blob.toLowerCase().includes(word.toLowerCase()), false, `must not invent label ${word}`);
  }
  for (const area of value.areas) {
    assert.equal("name" in area, false, "areas must not copy display names");
    assert.ok(area.anchorElementId, "areas identify their recovered context by element id");
  }
  for (const core of value.sharedCores) {
    assert.equal("name" in core, false);
    assert.ok(Array.isArray(core.anchorElementIds));
  }
}

test("observed areas compose leaf contexts without inventing labels or merging parents", () => {
  const model = buildSystemModel(regionDraft(), { systemName: "observed-areas-fixture" });
  const value = observedAreas(model);
  const regions = semanticRegionCandidates(model);
  const names = new Map(model.elements.map((item) => [item.id, item.name]));

  assert.equal(value.kind, "observed-areas");
  assert.equal(value.areas.length, 2);
  assertNoInventedLabels(value);

  const areaNames = value.areas.map((area) => names.get(area.anchorElementId)).sort();
  assert.deepEqual(areaNames, ["Alpha Tools", "Beta Tools"]);

  const core = value.sharedCores[0];
  assert.equal(value.sharedCores.length, 1);
  assert.equal(names.get(core.anchorElementIds[0]), "Shared Document");
  assert.deepEqual(core.usedByAreaIds.slice().sort(), value.areas.map((item) => item.id).sort());

  const left = value.areas.find((area) => names.get(area.anchorElementId) === "Alpha Tools");
  const right = value.areas.find((area) => names.get(area.anchorElementId) === "Beta Tools");
  assert.equal(intersection(left.envelopeIds, right.envelopeIds).length, 0);
  assert.deepEqual(left.sharedCoreIds, [core.id]);
  assert.deepEqual(right.sharedCoreIds, [core.id]);

  const screenParents = regions.regions.filter((item) => item.basis === "interaction-context" &&
    names.get(item.anchorElementIds[0])?.startsWith("Workspace"));
  assert.equal(screenParents.length, 2);
  assert.equal(value.areas.some((area) => screenParents.some((parent) => parent.id === area.id)), false,
    "nested screen parents stay out of the landing outline when leaf surfaces carry the operations");
});

test("operations carry primary effect, output, and outcome claim ids for evidence descent", () => {
  const model = buildSystemModel(regionDraft(), { systemName: "observed-areas-fixture" });
  const value = observedAreas(model);
  const names = new Map(model.elements.map((item) => [item.id, item.name]));
  const claims = new Map(model.claims.map((item) => [item.id, item]));
  const alpha = value.areas.find((area) => names.get(area.anchorElementId) === "Alpha Tools");

  assert.equal(alpha.operationCount, 2);
  assert.equal(alpha.operations.length, 2);
  const withMutation = alpha.operations.find((item) => item.primaryEffectClaimIds.length);
  const withArtifact = alpha.operations.find((item) => item.outputClaimIds.length);
  assert.ok(withMutation, "mutation effects remain primary effect claims");
  assert.ok(withArtifact, "produced artifacts remain output claims");
  assert.ok(withArtifact.outcomeClaimIds.length, "observed failure conditions remain outcome claims");
  assert.ok(withArtifact.claimIds.every((id) => claims.has(id)));
  assert.ok(withMutation.claimIds.includes(withMutation.primaryEffectClaimIds[0]));
  assert.ok(withArtifact.claimIds.includes(withArtifact.outputClaimIds[0]));
  assert.ok(withArtifact.claimIds.includes(withArtifact.outcomeClaimIds[0]));
  assert.ok(withArtifact.pathIds.length, "operations retain canonical observed path ids");
  assert.equal(withArtifact.prominence, "primary");
});

test("response contracts and outcomes remain supporting while mutations and artifacts are primary", () => {
  const model = buildSystemModel(regionDraft(), { systemName: "observed-areas-prominence-fixture" });
  const value = observedAreas(model);
  const names = new Map(model.elements.map((item) => [item.id, item.name]));
  const alpha = value.areas.find((area) => names.get(area.anchorElementId) === "Alpha Tools");
  const mutation = alpha.operations.find((item) => item.primaryEffectClaimIds.length);
  const artifact = alpha.operations.find((item) => item.outputClaimIds.some((id) => {
    const claimValue = model.claims.find((claimItem) => claimItem.id === id);
    return claimValue?.target.kind === "reference" && names.get(claimValue.target.id) === "Alpha Export";
  }));
  assert.equal(mutation.prominence, "primary");
  assert.equal(artifact.prominence, "primary");

  const draft = regionDraft();
  draft.claims = draft.claims.filter((item) => item.slot !== "specific-1" && item.slot !== "core-1" && item.slot !== "artifact");
  draft.claims.push(claim(source("api", "operation", "POST /a/two"), "fails_with",
    literal("condition", "temporarily unavailable"), "supporting-outcome"));
  const supportingModel = buildSystemModel(draft, { systemName: "observed-areas-supporting-fixture" });
  const supporting = observedAreas(supportingModel).areas
    .flatMap((area) => area.operations)
    .find((item) => supportingModel.elements.find((elementItem) => elementItem.id === item.entryBehaviorId)?.name === "a-two");
  assert.equal(supporting.prominence, "supporting");

  const stateDraft = regionDraft();
  stateDraft.elements.push(element("data", "state", "view-state", "Workspace View State", ["resource"]));
  stateDraft.claims = stateDraft.claims.filter((item) => item.slot !== "specific-1" && item.slot !== "core-1" && item.slot !== "artifact");
  stateDraft.claims.push(claim(source("api", "operation", "POST /a/two"), "changes",
    reference("data", "state", "view-state"), "view-state-change"));
  const stateModel = buildSystemModel(stateDraft, { systemName: "observed-areas-state-fixture" });
  const stateOperation = observedAreas(stateModel).areas.flatMap((area) => area.operations)
    .find((item) => stateModel.elements.find((elementItem) => elementItem.id === item.entryBehaviorId)?.name === "a-two");
  assert.equal(stateOperation.prominence, "supporting", "state mutation alone does not outrank domain operations");
});

test("parent-only operations remain visible without repeating child operations", () => {
  const draft = regionDraft();
  draft.elements.push(
    element("ui", "action", "screen-own", "Refresh workspace", ["behavior"]),
    element("api", "operation", "POST /workspace/refresh", "POST /workspace/refresh", ["interface", "behavior"]),
  );
  draft.claims.push(
    claim(source("ui", "screen", "screen-a"), "offers", reference("ui", "action", "screen-own"), "offer-screen-own"),
    claim(source("ui", "action", "screen-own"), "triggered_by", literal("event", "click"), "trigger-screen-own"),
    claim(source("ui", "action", "screen-own"), "invokes", reference("api", "operation", "POST /workspace/refresh"), "invoke-screen-own"),
    claim(source("api", "operation", "POST /workspace/refresh"), "changes", reference("data", "aggregate", "specific-a"), "effect-screen-own"),
  );
  const model = buildSystemModel(draft, { systemName: "observed-areas-parent-fixture" });
  const value = observedAreas(model);
  const names = new Map(model.elements.map((item) => [item.id, item.name]));
  const screen = value.areas.find((area) => names.get(area.anchorElementId) === "Workspace Alpha");
  const surface = value.areas.find((area) => names.get(area.anchorElementId) === "Alpha Tools");
  assert.ok(screen, "a parent with its own operation remains an observed area");
  assert.equal(screen.operations.length, 1);
  assert.equal(names.get(screen.operations[0].entryBehaviorId), "Refresh workspace");
  assert.equal(intersection(screen.envelopeIds, surface.envelopeIds).length, 0, "child operations are not repeated");
});

test("most-specific shared cores are linked once and never merge independent parents", () => {
  const value = projection();
  assert.equal(value.sharedCores.length, 1);
  for (const area of value.areas) {
    assert.deepEqual(area.sharedCoreIds, [value.sharedCores[0].id]);
  }
  assert.equal(value.areas.length, 2);
});

test("observed areas ignore display names and collection order", () => {
  const model = buildSystemModel(regionDraft(), { systemName: "observed-areas-fixture" });
  const renamed = buildSystemModel(regionDraft({
    names: {
      "screen-a": "Renamed Screen A",
      "surface-a": "Renamed Surface A",
      "screen-b": "Renamed Screen B",
      "surface-b": "Renamed Surface B",
      "shared-core": "Renamed Core",
    },
  }), { systemName: "observed-areas-fixture" });
  const reordered = {
    ...model,
    elements: [...model.elements].reverse(),
    claims: [...model.claims].reverse(),
  };
  assert.deepEqual(stripPresentation(observedAreas(renamed)), stripPresentation(observedAreas(model)));
  assert.deepEqual(observedAreas(reordered), observedAreas(model));
});

test("singleton contexts stay honestly ungrouped", () => {
  const value = projection({ singleton: true });
  assert.equal(value.areas.length, 0);
  assert.equal(value.sharedCores.length, 0);
  assert.equal(value.ungrouped.length, 1);
  assert.equal(value.ungrouped[0].reason, "interaction-context-has-one-envelope");
});

test("partial completeness is preserved on affected operations and areas", () => {
  const draft = regionDraft();
  draft.claims.push(claim(
    source("api", "operation", "POST /a/one"),
    "changes",
    literal("unresolved", "mystery"),
    "unresolved-effect",
  ));
  const model = buildSystemModel(draft, { systemName: "observed-areas-fixture" });
  const value = observedAreas(model);
  const names = new Map(model.elements.map((item) => [item.id, item.name]));
  const alpha = value.areas.find((area) => names.get(area.anchorElementId) === "Alpha Tools");
  assert.equal(alpha.completeness, "partial");
  assert.ok(alpha.operations.some((item) => item.completeness === "partial"));
});

test("areas rank by meaningful operation count then stable id", () => {
  const value = projection();
  assert.ok(value.areas[0].primaryOperationCount >= value.areas[1].primaryOperationCount);
  if (value.areas[0].primaryOperationCount === value.areas[1].primaryOperationCount) {
    assert.ok(value.areas[0].operationCount >= value.areas[1].operationCount);
  }
  if (value.areas[0].primaryOperationCount === value.areas[1].primaryOperationCount &&
      value.areas[0].operationCount === value.areas[1].operationCount) {
    assert.ok(value.areas[0].id.localeCompare(value.areas[1].id) <= 0);
  }
});

function stripPresentation(value) {
  return {
    kind: value.kind,
    areas: value.areas.map(({ id, regionId, anchorElementId, envelopeIds, sharedCoreIds, operationCount }) => ({
      id, regionId, anchorElementId, envelopeIds, sharedCoreIds, operationCount,
    })),
    sharedCores: value.sharedCores.map(({ id, regionId, anchorElementIds, usedByAreaIds }) => ({
      id, regionId, anchorElementIds, usedByAreaIds,
    })),
    ungrouped: value.ungrouped,
  };
}

function intersection(left, right) {
  const values = new Set(right);
  return left.filter((item) => values.has(item));
}
