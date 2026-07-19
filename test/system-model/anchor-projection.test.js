import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { browseByThing, browseByCapability } from "../../src/system-model/projections/index.js";

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
