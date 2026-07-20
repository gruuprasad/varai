import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import {
  behaviorFrames,
  behavioralEnvelopes,
  browseByThing,
  browseByCapability,
  systemPaths,
} from "../../src/system-model/projections/index.js";

async function model() {
  return (await scanRepo(path.resolve("test/fixtures/anchor-lift/base"), {
    jobs: 1, cache: false, systemName: "anchor-lift-fixture",
  })).model;
}

test("browse-by-thing ranks interacted subjects without making endpoints roots", async () => {
  const value = await model();
  const projection = browseByThing(value);
  const byId = new Map(value.elements.map((item) => [item.id, item]));
  const rootNames = projection.roots.map((item) => byId.get(item.elementId)?.name);

  assert.equal(rootNames[0], "BuildingDocument");
  assert.ok(!rootNames.some((name) => name?.startsWith("POST /") || name?.startsWith("DELETE /")));
  assert.ok(projection.roots[0].behaviorIds.length >= 3);
});

test("browse-by-capability keeps distinct actions and their Resource reach", async () => {
  const value = await model();
  const projection = browseByCapability(value);
  const byId = new Map(value.elements.map((item) => [item.id, item]));
  const names = projection.capabilities.map((item) => byId.get(item.behaviorId)?.name);

  assert.ok(names.includes("POST /projects/{project_id}/building/walls"));
  assert.ok(names.includes("DELETE /projects/{project_id}/building/storeys/{storey_id}"));
  assert.ok(projection.capabilities.some((item) => item.resourceIds.some((id) => byId.get(id)?.name === "BuildingDocument")));
});

test("anchor projections are deterministic under collection ordering", async () => {
  const value = await model();
  const reversed = {
    ...value,
    subsystems: [...value.subsystems].reverse(),
    elements: [...value.elements].reverse(),
    claims: [...value.claims].reverse(),
  };
  assert.deepEqual(browseByThing(value), browseByThing(reversed));
  assert.deepEqual(browseByCapability(value), browseByCapability(reversed));
  assert.deepEqual(behaviorFrames(value), behaviorFrames(reversed));
  assert.deepEqual(systemPaths(value), systemPaths(reversed));
  assert.deepEqual(behavioralEnvelopes(value), behavioralEnvelopes(reversed));
});

test("behavioral envelopes assemble evidence into semantic sections", async () => {
  const value = await model();
  const projection = behavioralEnvelopes(value);
  const byId = new Map(value.elements.map((item) => [item.id, item]));
  const claims = new Map(value.claims.map((item) => [item.id, item]));
  const envelope = projection.envelopes.find((item) => item.name.toLowerCase().includes("delete storey"));

  assert.ok(envelope);
  assert.equal(envelope.behaviorIds.length, 2);
  assert.ok(envelope.triggerClaimIds.length);
  assert.ok(envelope.invocationClaimIds.length);
  assert.ok(envelope.primaryEffectClaimIds.some((id) => ["changes", "creates", "removes"].includes(claims.get(id)?.relation)));
  assert.ok(envelope.supportingEffectClaimIds.every((id) => claims.get(id)?.relation === "reads"));
  assert.ok(envelope.primarySubjectIds.some((id) => byId.get(id)?.name === "BuildingDocument"));
  assert.ok(!envelope.primarySubjectIds.some((id) => byId.get(id)?.kind === "contract"));
  assert.ok(envelope.unresolvedClaimIds.length);
  assert.equal(envelope.completeness, "partial");
  assert.ok(envelope.completenessReasons.includes("unresolved-effect"));
});

test("private evidence movement does not change envelope identity or semantic membership", async () => {
  const value = await model();
  const moved = {
    ...value,
    claims: value.claims.map((claim) => ({
      ...claim,
      implementationPath: (claim.implementationPath ?? []).map((item) => ({ ...item, line: (item.line ?? 1) + 100 })),
    })),
  };
  const original = behavioralEnvelopes(value).envelopes;
  const changed = behavioralEnvelopes(moved).envelopes;
  const semantic = ({ implementationEvidence, ...item }) => item;
  assert.deepEqual(original.map(semantic), changed.map(semantic));
});

test("behavior frames separate effect subjects from contracts", async () => {
  const value = await model();
  const projection = behaviorFrames(value);
  const byId = new Map(value.elements.map((item) => [item.id, item]));
  const frame = projection.frames.find((item) =>
    byId.get(item.behaviorId)?.name === "POST /projects/{project_id}/building/walls");

  assert.ok(frame);
  assert.ok(frame.subjectIds.some((id) => byId.get(id)?.name === "BuildingDocument"));
  assert.ok(!frame.subjectIds.some((id) => byId.get(id)?.name === "AddWallRequest"));
  assert.ok(frame.inputClaimIds.length >= 1);
  assert.ok(frame.outputClaimIds.length >= 1);
});

test("system paths compose a UI action through its API operation to its subject", async () => {
  const value = await model();
  const projection = systemPaths(value);
  const byId = new Map(value.elements.map((item) => [item.id, item]));
  const path = projection.paths.find((item) => item.name.toLowerCase().includes("delete storey"));

  assert.ok(path);
  assert.equal(path.steps.length, 2);
  assert.equal(byId.get(path.steps[0].behaviorId)?.kind, "action");
  assert.equal(byId.get(path.steps[1].behaviorId)?.kind, "operation");
  assert.ok(path.subjectIds.some((id) => byId.get(id)?.name === "BuildingDocument"));
  // Resolves the subject but also carries an unresolved `changes file` effect, so it is
  // partial, not open — the subject was reached, uncertainty remains.
  assert.equal(path.completeness, "partial");
});

test("subjects are tier 0, screens nest surfaces, unplaced surfaces stay honest", async () => {
  const value = await model();
  const projection = browseByThing(value);
  const byId = new Map(value.elements.map((item) => [item.id, item]));

  for (const root of projection.roots) {
    const kind = byId.get(root.elementId)?.kind;
    if (["aggregate", "entity"].includes(kind)) assert.equal(root.tier, 0, `${kind} must be tier 0`);
    if (["screen", "surface"].includes(kind)) assert.equal(root.tier, 1, `${kind} must be tier 1`);
    if (["contract", "state"].includes(kind)) assert.equal(root.tier, 2, `${kind} must be tier 2`);
  }

  const screenRoot = projection.roots.find((item) => byId.get(item.elementId)?.name === "/plan");
  assert.ok(screenRoot, "screen /plan is a root");
  assert.ok(screenRoot.surfaceIds.some((id) => byId.get(id)?.name === "BuildingToolbar"));
  assert.ok(screenRoot.behaviorIds.length >= 1, "screen inherits its surfaces' offered behaviors");
  assert.ok(!projection.roots.some((item) => byId.get(item.elementId)?.name === "BuildingToolbar"),
    "contained surfaces are not roots");

  const orphanRoot = projection.roots.find((item) => byId.get(item.elementId)?.name === "OrphanPanel");
  assert.ok(orphanRoot, "unplaced surfaces remain roots");
  assert.equal(orphanRoot.tier, 1);
  assert.ok(projection.diagnostics.some((item) =>
    item.code === "surface-not-placed" && item.elementId === orphanRoot.elementId));

  const tierOne = projection.roots.filter((item) => item.tier === 1);
  const firstSurfaceIndex = tierOne.findIndex((item) => byId.get(item.elementId)?.kind === "surface");
  const lastScreenIndex = tierOne.map((item) => byId.get(item.elementId)?.kind).lastIndexOf("screen");
  if (firstSurfaceIndex >= 0) assert.ok(lastScreenIndex < firstSurfaceIndex, "screens sort before unplaced surfaces");
});
