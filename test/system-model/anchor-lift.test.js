import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";

const fixture = (name) => path.resolve(`test/fixtures/anchor-lift/${name}`);

async function scan(name) {
  return (await scanRepo(fixture(name), { jobs: 1, cache: false, systemName: "anchor-lift-fixture" })).model;
}

function named(model, name) {
  return model.elements.filter((item) => item.name === name);
}

function targetName(model, claim) {
  if (claim.target.kind !== "reference") return claim.target.value;
  return model.elements.find((item) => item.id === claim.target.id)?.name;
}

test("anchor lift promotes subjects and public contracts without private DTO inventory", async () => {
  const model = await scan("base");

  assert.equal(named(model, "Project").length, 1);
  assert.equal(named(model, "BuildingDocument").length, 1);
  assert.equal(named(model, "ActionResponse").length, 1);
  assert.equal(named(model, "AddWallRequest").length, 1);
  assert.equal(named(model, "PrivateMutation").length, 0);
  assert.equal(named(model, "Record").length, 2, "same-name declarations remain distinct");

  const building = named(model, "BuildingDocument")[0];
  assert.ok(building.roles.includes("resource"));
  const effects = model.claims.filter((claim) =>
    ["reads", "changes", "creates", "removes"].includes(claim.relation) &&
    claim.target.kind === "reference" && claim.target.id === building.id);
  assert.ok(new Set(effects.map((claim) => claim.sourceId)).size >= 3);
  assert.ok(effects.every((claim) => claim.implementationPath?.length >= 2));

  assert.equal(named(model, "file").length, 0);
  assert.equal(named(model, "unknown resource").length, 0);
});

test("actions affecting one Resource remain distinct Behaviors", async () => {
  const model = await scan("base");
  const behaviorNames = model.elements
    .filter((item) => item.roles.includes("behavior"))
    .map((item) => item.name);

  assert.ok(behaviorNames.includes("POST /projects/{project_id}/building/walls"));
  assert.ok(behaviorNames.includes("DELETE /projects/{project_id}/building/storeys/{storey_id}"));
  assert.ok(behaviorNames.includes("POST /projects/{project_id}/building/import"));
});

test("unresolved effects become partial coverage or diagnostics, never invented Resources", async () => {
  const model = await scan("base");
  assert.ok(model.diagnostics.some((item) => item.code === "unresolved-effect-target" || item.code === "untraced-call"));
  assert.ok(model.coverage.some((item) => item.capability === "api.effect" && item.state === "partial"));
  assert.ok(!model.elements.some((item) => ["file", "unknown resource"].includes(item.name)));
});

test("effect targets are references rather than repeated name literals", async () => {
  const model = await scan("base");
  const effects = model.claims.filter((claim) => ["reads", "changes", "creates", "removes"].includes(claim.relation));
  assert.ok(effects.some((claim) => targetName(model, claim) === "BuildingDocument"));
  assert.ok(!effects.some((claim) => claim.target.kind === "literal" && claim.target.value === "BuildingDocument"));
});
