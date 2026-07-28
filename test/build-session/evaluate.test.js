import assert from "node:assert/strict";
import test from "node:test";
import { classifyCoverageTransition, evaluateBuildGate } from "../../src/build-session/evaluate.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { createSystemModel } from "../../src/system-model/canonicalize.js";

function modelWithCoverage({
  state = "analyzed",
  analyzerVersion = "0.20.0",
  evidenceFile = "routes/book.py",
  details = [],
} = {}) {
  return createSystemModel({
    systemName: "fixture",
    analyzerVersion,
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: [{
      subsystemKey: "api",
      key: "POST /book",
      kind: "operation",
      name: "POST /book",
      roles: ["interface", "behavior"],
      evidence: [{ file: evidenceFile, line: 1 }],
      claimState: "observed",
    }],
    coverage: [{
      analyzerId: "system-model.builder",
      analyzerVersion,
      capability: "api.effect",
      scope: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "POST /book" },
      state,
      evidence: [{ file: evidenceFile, line: 10 }],
      details,
    }],
  });
}

function reportWith(verdict) {
  return {
    commitments: [{
      id: "commitment.book-creates-booking",
      verdict,
      claimIds: ["claim.one"],
      bindings: [{ id: "binding.behavior", state: "resolved" }],
      coverage: [],
      reasons: [],
    }],
  };
}

test("analyzed to partial is degraded and blocks ready", () => {
  const start = modelWithCoverage({ state: "analyzed" });
  const end = modelWithCoverage({ state: "partial", details: ["unresolved function"] });
  const before = start.coverage[0];
  const after = end.coverage[0];
  assert.equal(classifyCoverageTransition(before, after), "degraded");

  const gate = evaluateBuildGate({
    startModel: start,
    completionModel: end,
    startReport: reportWith("holds"),
    completionReport: reportWith("holds"),
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.equal(gate.coverageRegressions.length, 1);
  assert.equal(gate.coverageRegressions[0].transition, "degraded");
  assert.equal(gate.coverageRegressions[0].capability, "api.effect");
  assert.equal(gate.coverageRegressions[0].scopeId, before.scopeId);
  assert.ok(gate.reasons.some((reason) => reason.includes("coverage-degraded")));
});

test("partial to analyzed is improved and can be ready", () => {
  const start = modelWithCoverage({ state: "partial", details: ["unresolved function"] });
  const end = modelWithCoverage({ state: "analyzed" });
  assert.equal(classifyCoverageTransition(start.coverage[0], end.coverage[0]), "improved");

  const gate = evaluateBuildGate({
    startModel: start,
    completionModel: end,
    startReport: reportWith("holds"),
    completionReport: reportWith("holds"),
  });
  assert.equal(gate.state, GATE_STATES.READY);
  assert.equal(gate.coverageRegressions.length, 0);
});

test("analyzer version change alone is reported separately and does not block ready", () => {
  const start = modelWithCoverage({ state: "analyzed", analyzerVersion: "0.20.0" });
  const end = modelWithCoverage({ state: "analyzed", analyzerVersion: "0.21.0" });
  assert.equal(classifyCoverageTransition(start.coverage[0], end.coverage[0]), "analyzer_version_changed");

  const gate = evaluateBuildGate({
    startModel: start,
    completionModel: end,
    startReport: reportWith("holds"),
    completionReport: reportWith("holds"),
  });
  assert.equal(gate.state, GATE_STATES.READY);
  assert.equal(gate.coverageRegressions.length, 0);
  assert.ok(gate.reasons.some((reason) => reason.includes("analyzer-version-changed")));
});

test("evidence movement without coverage state change is not a regression", () => {
  const start = modelWithCoverage({ state: "analyzed", evidenceFile: "a.py" });
  const end = modelWithCoverage({ state: "analyzed", evidenceFile: "b.py" });
  assert.equal(classifyCoverageTransition(start.coverage[0], end.coverage[0]), "unchanged");

  const gate = evaluateBuildGate({
    startModel: start,
    completionModel: end,
    startReport: reportWith("holds"),
    completionReport: reportWith("holds"),
  });
  assert.equal(gate.state, GATE_STATES.READY);
  assert.deepEqual(gate.coverageRegressions, []);
  assert.deepEqual(gate.requirementRegressions, []);
});

test("holds to cannot_verify is a requirement regression", () => {
  const model = modelWithCoverage({ state: "analyzed" });
  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: reportWith("holds"),
    completionReport: reportWith("cannot_verify"),
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.equal(gate.requirementRegressions.length, 1);
  assert.equal(gate.requirementRegressions[0].from, "holds");
  assert.equal(gate.requirementRegressions[0].to, "cannot_verify");
  assert.ok(gate.reasons.some((reason) => reason.includes("requirement-regression")));
});

test("holds to violated is a requirement regression", () => {
  const model = modelWithCoverage({ state: "analyzed" });
  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: reportWith("holds"),
    completionReport: reportWith("violated"),
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.equal(gate.requirementRegressions[0].to, "violated");
});

test("missing previously analyzed coverage is degraded", () => {
  const start = modelWithCoverage({ state: "analyzed" });
  const end = createSystemModel({
    systemName: "fixture",
    subsystems: [{ key: "api", lens: "api", name: "API" }],
    elements: [{
      subsystemKey: "api",
      key: "POST /book",
      kind: "operation",
      name: "POST /book",
      roles: ["interface", "behavior"],
      evidence: [{ file: "a.py", line: 1 }],
      claimState: "observed",
    }],
    coverage: [],
  });
  assert.equal(classifyCoverageTransition(start.coverage[0], null), "degraded");
  const gate = evaluateBuildGate({
    startModel: start,
    completionModel: end,
    startReport: reportWith("holds"),
    completionReport: reportWith("cannot_verify"),
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.equal(gate.coverageRegressions[0].transition, "degraded");
});
