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
