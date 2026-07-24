import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { archUnits } from "../../src/system-model/projections/index.js";

function twoSubsystemModel({
  crossDependency = true,
  intraDependency = false,
  reverseClaimOrder = false,
} = {}) {
  const api = { key: "api", lens: "api", name: "API" };
  const core = { key: "core", lens: "api", name: "Core" };
  const consumer = {
    subsystemKey: "api",
    key: "consumer.py",
    kind: "operation",
    name: "consumer",
    roles: ["behavior"],
    evidence: [{ file: "api/consumer.py", line: 1 }],
    claimState: "observed",
    capability: "arch.dependency",
  };
  const helper = {
    subsystemKey: "api",
    key: "helper.py",
    kind: "operation",
    name: "helper",
    roles: ["behavior"],
    evidence: [{ file: "api/helper.py", line: 1 }],
    claimState: "observed",
    capability: "arch.dependency",
  };
  const provider = {
    subsystemKey: "core",
    key: "provider.py",
    kind: "operation",
    name: "provider",
    roles: ["behavior"],
    evidence: [{ file: "core/provider.py", line: 1 }],
    claimState: "observed",
    capability: "arch.dependency",
  };

  const cross = {
    source: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "consumer.py" },
    relation: "depends_on",
    target: {
      kind: "reference",
      reference: { kind: "element", subsystemKey: "core", elementKind: "operation", key: "provider.py" },
    },
    slot: "depends_on:provider.py",
    claimState: "observed",
    observationMethod: "ast",
    evidence: [{ file: "api/consumer.py", line: 3, symbol: "provider" }],
    capability: "arch.dependency",
  };
  const intra = {
    source: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "consumer.py" },
    relation: "depends_on",
    target: {
      kind: "reference",
      reference: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "helper.py" },
    },
    slot: "depends_on:helper.py",
    claimState: "observed",
    observationMethod: "ast",
    evidence: [{ file: "api/consumer.py", line: 4, symbol: "helper" }],
    capability: "arch.dependency",
  };

  const claims = [];
  if (crossDependency) claims.push(cross);
  if (intraDependency) claims.push(intra);
  if (reverseClaimOrder) claims.reverse();

  return createSystemModel({
    systemName: "fixture",
    subsystems: reverseClaimOrder ? [core, api] : [api, core],
    elements: reverseClaimOrder ? [provider, helper, consumer] : [consumer, helper, provider],
    claims,
  });
}

test("archUnits default grain is subsystem and rolls up cross-unit depends_on", () => {
  const model = twoSubsystemModel();
  const view = archUnits(model);

  assert.equal(view.kind, "arch-units");
  assert.equal(view.grain, "subsystem");
  assert.equal(view.units.length, 2);

  const apiUnit = view.units.find((unit) => model.subsystems.some(
    (subsystem) => subsystem.key === "api" && subsystem.id === unit.id,
  ));
  const coreUnit = view.units.find((unit) => model.subsystems.some(
    (subsystem) => subsystem.key === "core" && subsystem.id === unit.id,
  ));
  assert.ok(apiUnit, "api subsystem becomes a unit");
  assert.ok(coreUnit, "core subsystem becomes a unit");

  const consumer = model.elements.find((item) => item.key === "consumer.py");
  const helper = model.elements.find((item) => item.key === "helper.py");
  const provider = model.elements.find((item) => item.key === "provider.py");
  assert.deepEqual(apiUnit.memberElementIds, [consumer.id, helper.id].sort());
  assert.deepEqual(coreUnit.memberElementIds, [provider.id]);

  assert.deepEqual(apiUnit.outboundUnitIds, [coreUnit.id]);
  assert.deepEqual(apiUnit.inboundUnitIds, []);
  assert.equal(apiUnit.outboundEdgeCount, 1);
  assert.equal(apiUnit.inboundEdgeCount, 0);

  assert.deepEqual(coreUnit.inboundUnitIds, [apiUnit.id]);
  assert.deepEqual(coreUnit.outboundUnitIds, []);
  assert.equal(coreUnit.inboundEdgeCount, 1);
  assert.equal(coreUnit.outboundEdgeCount, 0);

  assert.equal(view.edges.length, 1);
  assert.equal(view.edges[0].fromUnitId, apiUnit.id);
  assert.equal(view.edges[0].toUnitId, coreUnit.id);
  assert.equal(view.edges[0].edgeCount, 1);
  const claim = model.claims.find((item) => item.relation === "depends_on");
  assert.deepEqual(view.edges[0].claimIds, [claim.id]);
});

test("intra-unit depends_on does not become a unit→unit edge", () => {
  const model = twoSubsystemModel({ crossDependency: false, intraDependency: true });
  const view = archUnits(model);

  assert.equal(view.edges.length, 0);
  for (const unit of view.units) {
    assert.deepEqual(unit.outboundUnitIds, []);
    assert.deepEqual(unit.inboundUnitIds, []);
    assert.equal(unit.outboundEdgeCount, 0);
    assert.equal(unit.inboundEdgeCount, 0);
  }
});

test("grain is switchable to module without re-scan and groups by lex-min evidence file", () => {
  const model = twoSubsystemModel();
  const subsystemView = archUnits(model);
  const moduleView = archUnits(model, { grain: "module" });

  assert.equal(subsystemView.grain, "subsystem");
  assert.equal(moduleView.kind, "arch-units");
  assert.equal(moduleView.grain, "module");

  const consumer = model.elements.find((item) => item.key === "consumer.py");
  const helper = model.elements.find((item) => item.key === "helper.py");
  const provider = model.elements.find((item) => item.key === "provider.py");

  const byId = new Map(moduleView.units.map((unit) => [unit.id, unit]));
  assert.equal(moduleView.units.length, 3);
  assert.ok(byId.has("module:api/consumer.py"));
  assert.ok(byId.has("module:api/helper.py"));
  assert.ok(byId.has("module:core/provider.py"));
  assert.deepEqual(byId.get("module:api/consumer.py").memberElementIds, [consumer.id]);
  assert.deepEqual(byId.get("module:api/helper.py").memberElementIds, [helper.id]);
  assert.deepEqual(byId.get("module:core/provider.py").memberElementIds, [provider.id]);

  assert.deepEqual(byId.get("module:api/consumer.py").outboundUnitIds, ["module:core/provider.py"]);
  assert.equal(byId.get("module:api/consumer.py").outboundEdgeCount, 1);
  assert.deepEqual(byId.get("module:core/provider.py").inboundUnitIds, ["module:api/consumer.py"]);
  assert.equal(byId.get("module:core/provider.py").inboundEdgeCount, 1);

  assert.equal(moduleView.edges.length, 1);
  assert.equal(moduleView.edges[0].fromUnitId, "module:api/consumer.py");
  assert.equal(moduleView.edges[0].toUnitId, "module:core/provider.py");
});

test("module grain places multi-file Elements in the lex-min evidence file unit", () => {
  const model = createSystemModel({
    systemName: "fixture",
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: [{
      subsystemKey: "api",
      key: "multi.py",
      kind: "operation",
      name: "multi",
      roles: ["behavior"],
      // Larger path first in input; module grain must still use lex-min file.
      evidence: [
        { file: "api/z_site.py", line: 1 },
        { file: "api/a_site.py", line: 2 },
        { file: "api/m_site.py", line: 3 },
      ],
      claimState: "observed",
      capability: "arch.dependency",
    }],
    claims: [],
  });
  const element = model.elements.find((item) => item.key === "multi.py");
  assert.ok(element);
  assert.ok(element.evidence.length >= 2, "fixture keeps multiple evidence files");

  const view = archUnits(model, { grain: "module" });
  assert.equal(view.units.length, 1);
  assert.equal(view.units[0].id, "module:api/a_site.py");
  assert.deepEqual(view.units[0].memberElementIds, [element.id]);
  assert.equal(
    view.units.some((unit) => unit.id === "module:api/z_site.py"),
    false,
    "lex-larger evidence files do not become the module unit id",
  );
});

test("module grain uses implementationPath when evidence has no file", () => {
  const model = createSystemModel({
    systemName: "fixture",
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: [{
      subsystemKey: "api",
      key: "impl-only.py",
      kind: "operation",
      name: "impl-only",
      roles: ["behavior"],
      evidence: [{ line: 1, symbol: "orphan" }],
      implementationPath: [
        { file: "api/z_impl.py", line: 1 },
        { file: "api/a_impl.py", line: 2 },
      ],
      claimState: "observed",
      capability: "arch.dependency",
    }],
    claims: [],
  });
  const element = model.elements.find((item) => item.key === "impl-only.py");
  assert.ok(element);
  assert.equal(
    (element.evidence ?? []).filter((item) => item?.file).length,
    0,
    "fixture has no file on evidence",
  );

  const view = archUnits(model, { grain: "module" });
  assert.equal(view.units.length, 1);
  assert.equal(view.units[0].id, "module:api/a_impl.py");
  assert.deepEqual(view.units[0].memberElementIds, [element.id]);
});

test("module grain lex-min spans evidence and implementationPath together", () => {
  const model = createSystemModel({
    systemName: "fixture",
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: [{
      subsystemKey: "api",
      key: "mixed-paths.py",
      kind: "operation",
      name: "mixed",
      roles: ["behavior"],
      evidence: [{ file: "api/m_ev.py", line: 1 }],
      implementationPath: [{ file: "api/a_impl.py", line: 2 }],
      claimState: "observed",
      capability: "arch.dependency",
    }],
    claims: [],
  });
  const element = model.elements.find((item) => item.key === "mixed-paths.py");
  const view = archUnits(model, { grain: "module" });
  assert.equal(view.units[0].id, "module:api/a_impl.py");
  assert.deepEqual(view.units[0].memberElementIds, [element.id]);
});

test("archUnits ordering is deterministic regardless of input order", () => {
  const a = archUnits(twoSubsystemModel());
  const b = archUnits(twoSubsystemModel({ reverseClaimOrder: true }));
  assert.deepEqual(a, b);
});

test("archUnits invents no facts beyond existing claims and element membership", () => {
  const model = twoSubsystemModel({ crossDependency: true, intraDependency: true });
  const view = archUnits(model);
  const elementIds = new Set(model.elements.map((item) => item.id));
  const claimIds = new Set(model.claims.map((item) => item.id));
  const subsystemIds = new Set(model.subsystems.map((item) => item.id));

  for (const unit of view.units) {
    assert.ok(subsystemIds.has(unit.id));
    for (const memberId of unit.memberElementIds) assert.ok(elementIds.has(memberId));
  }
  for (const edge of view.edges) {
    for (const claimId of edge.claimIds) assert.ok(claimIds.has(claimId));
  }
  assert.equal(
    view.edges.reduce((sum, edge) => sum + edge.edgeCount, 0),
    model.claims.filter((claim) => {
      if (claim.relation !== "depends_on" || claim.target.kind !== "reference") return false;
      const source = model.elements.find((item) => item.id === claim.sourceId);
      const target = model.elements.find((item) => item.id === claim.target.id);
      return source && target && source.subsystemId !== target.subsystemId;
    }).length,
  );
});
