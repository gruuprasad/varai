import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";

async function scan() {
  return (await scanRepo(path.resolve("test/fixtures/anchor-lift/base"), {
    jobs: 1, cache: false, systemName: "anchor-lift-fixture",
  })).model;
}

test("screens contain the surfaces their render chain reaches", async () => {
  const model = await scan();
  const byId = new Map(model.elements.map((item) => [item.id, item]));
  const screen = model.elements.find((item) => item.kind === "screen" && item.name === "/plan");
  assert.ok(screen, "route /plan becomes a screen element");
  const contains = model.claims.filter((claim) =>
    claim.sourceId === screen.id && claim.relation === "contains" && claim.target.kind === "reference");
  const targets = contains.map((claim) => byId.get(claim.target.id)?.name);
  assert.ok(targets.includes("BuildingToolbar"), `expected BuildingToolbar in ${JSON.stringify(targets)}`);
  // Verify exact containment set — a bug that over-includes must fail
  const surfaces = model.elements.filter((item) => item.kind === "surface");
  const expectedContained = new Set(["BuildingToolbar"]);
  for (const surface of surfaces) {
    const isContained = targets.includes(surface.name);
    if (expectedContained.has(surface.name)) {
      assert.ok(isContained, `expected ${surface.name} to be contained`);
    } else {
      assert.ok(!isContained, `${surface.name} should NOT be contained by /plan`);
    }
  }
  assert.ok(contains.every((claim) => claim.claimState === "observed"));
  assert.ok(contains.every((claim) => claim.evidence.length > 0));
});

test("surfaces outside any resolved render chain stay unattached", async () => {
  const model = await scan();
  const byId = new Map(model.elements.map((item) => [item.id, item]));
  const orphan = model.elements.find((item) => item.kind === "surface" && item.name === "OrphanPanel");
  assert.ok(orphan, "OrphanPanel is still promoted as a surface");
  const contained = model.claims.some((claim) => claim.relation === "contains" &&
    claim.target.kind === "reference" && claim.target.id === orphan.id &&
    byId.get(claim.sourceId)?.kind === "screen");
  assert.equal(contained, false);
});
