import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { diffSystemModels } from "../../src/system-model/diff.js";

function dependsOn(model) {
  return model.claims.filter((claim) => claim.relation === "depends_on");
}

test("adding one cross-module import adds exactly one depends_on claim", { timeout: 30_000 }, async () => {
  const base = await scanRepo(path.resolve("test/fixtures/arch-units/base"), { cache: false });
  const added = await scanRepo(path.resolve("test/fixtures/arch-units/dependency-added"), { cache: false });

  const baseDeps = dependsOn(base.model);
  const addedDeps = dependsOn(added.model);
  assert.equal(baseDeps.length, 0, "base has no resolvable cross-Element dependency");
  assert.equal(addedDeps.length, 1, "dependency-added has exactly one depends_on claim");

  const claim = addedDeps[0];
  assert.equal(claim.relation, "depends_on");
  assert.equal(claim.target.kind, "reference");
  assert.equal(claim.capability, "arch.dependency");
  assert.equal(claim.observationMethod, "ast");
});

test("the added dependency surfaces through diffSystemModels", { timeout: 30_000 }, async () => {
  const base = await scanRepo(path.resolve("test/fixtures/arch-units/base"), { cache: false });
  const added = await scanRepo(path.resolve("test/fixtures/arch-units/dependency-added"), { cache: false });

  const diff = diffSystemModels(base.model, added.model);
  const addedDepends = diff.claims.added.filter((claim) => claim.relation === "depends_on");
  assert.equal(addedDepends.length, 1);
});

test("arch.dependency analyzed coverage is only for Python-bearing subsystems", { timeout: 30_000 }, async () => {
  const base = await scanRepo(path.resolve("test/fixtures/arch-units/base"), { cache: false });
  const coverage = base.model.coverage.filter((item) => item.capability === "arch.dependency");
  assert.ok(coverage.length >= 1, "arch.dependency coverage entries exist");

  const subsystemById = new Map(base.model.subsystems.map((item) => [item.id, item]));
  const pythonSubsystemIds = new Set();
  for (const element of base.model.elements) {
    const files = [...(element.evidence ?? []), ...(element.implementationPath ?? [])]
      .map((entry) => entry.file)
      .filter(Boolean);
    if (files.some((file) => file.toLowerCase().endsWith(".py"))) {
      pythonSubsystemIds.add(element.subsystemId);
    }
  }

  for (const record of coverage) {
    assert.ok(subsystemById.has(record.scopeId), `coverage scope ${record.scopeId} is a subsystem`);
    assert.equal(record.state, "analyzed");
    assert.ok(
      pythonSubsystemIds.has(record.scopeId),
      `analyzed arch.dependency must not cover non-Python subsystem ${subsystemById.get(record.scopeId)?.key}`,
    );
  }
  assert.equal(
    coverage.length,
    pythonSubsystemIds.size,
    "one analyzed arch.dependency coverage per Python-bearing subsystem",
  );
});

test("mixed Python+UI fixture omits arch.dependency coverage on non-Python lenses", { timeout: 30_000 }, async () => {
  const scan = await scanRepo(path.resolve("test/fixtures/semantic-assembly-structural"), { cache: false });
  const ui = scan.model.subsystems.find((item) => item.lens === "ui");
  assert.ok(ui, "fixture has a ui subsystem");
  const uiArch = scan.model.coverage.filter(
    (item) => item.capability === "arch.dependency" && item.scopeId === ui.id,
  );
  assert.equal(uiArch.length, 0, "ui (tsx-only) must not claim analyzed arch.dependency");

  const api = scan.model.subsystems.find((item) => item.lens === "api");
  const apiArch = scan.model.coverage.filter(
    (item) => item.capability === "arch.dependency" && item.scopeId === api.id,
  );
  assert.equal(apiArch.length, 1);
  assert.equal(apiArch[0].state, "analyzed");
});
