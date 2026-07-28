import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { evaluateBuildGate } from "../../src/build-session/evaluate.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { readSeed } from "../../src/seed/store.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { analyzeCurrent } from "../../src/snapshots/snapshot.js";
import { readRuntimeMap } from "../../src/runtime/load.js";
import { resolveRuntimeOperations } from "../../src/runtime/resolve.js";
import { runHttpScenarios } from "../../src/runtime/http-runner.js";

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/purchase-approval-runtime");

function envWith(fault) {
  return {
    ...process.env,
    PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
    VARAI_POC_EMPLOYEE_1_TOKEN: "fixture-employee-1-token",
    VARAI_POC_EMPLOYEE_2_TOKEN: "fixture-employee-2-token",
    ...(fault ? { VARAI_POC_FAULT: fault } : {}),
  };
}

async function runScenarios(fault) {
  const seedInput = readSeed(fixture);
  const realization = readRealization(fixture, { seed: seedInput.seed }).realization;
  const runtime = readRuntimeMap(fixture, { expectedSeedHash: seedInput.contentHash }).runtime;
  const current = await analyzeCurrent(fixture, { jobs: 1, cache: false });
  const resolution = resolveRuntimeOperations({
    model: current.scan.model,
    seed: seedInput.seed,
    realization,
    runtime,
    seedHash: seedInput.contentHash,
  });
  assert.equal(resolution.ok, true, JSON.stringify(resolution.problems));
  return runHttpScenarios({
    repoPath: fixture,
    runtime,
    operations: resolution.operations,
    scenarios: seedInput.seed.scenarios,
    env: envWith(fault),
  });
}

test("inverting the owner condition fails the non-owner scenario", async () => {
  const { results } = await runScenarios("invert_auth");
  const nonOwner = results.find((item) => item.id === "scenario.non-owner-cannot-withdraw");
  assert.equal(nonOwner.result, "failed");
  assert.ok(nonOwner.reasons.some((reason) => /status|403|200/.test(reason)));
});

test("mapping withdraw to a different route fails runtime resolution", async () => {
  const seedInput = readSeed(fixture);
  const realization = readRealization(fixture, { seed: seedInput.seed }).realization;
  const runtime = readRuntimeMap(fixture, { expectedSeedHash: seedInput.contentHash }).runtime;
  const current = await analyzeCurrent(fixture, { jobs: 1, cache: false });
  const broken = {
    ...runtime,
    operations: runtime.operations.map((operation) =>
      operation.behavior === "behavior.withdraw-request"
        ? { ...operation, method: "DELETE", path: "/api/purchase-requests/{requestId}" }
        : operation),
  };
  const resolution = resolveRuntimeOperations({
    model: current.scan.model,
    seed: seedInput.seed,
    realization,
    runtime: broken,
    seedHash: seedInput.contentHash,
  });
  assert.equal(resolution.ok, false);
  assert.ok(resolution.problems.some((p) => p.code === "operation-unresolved"));
});

test("unrequested destructive DELETE is unaccounted by surface accounting", async () => {
  const seedInput = readSeed(fixture);
  const realization = readRealization(fixture, { seed: seedInput.seed }).realization;
  const current = await analyzeCurrent(fixture, { jobs: 1, cache: false });
  const DELETE = "DELETE /api/purchase-requests/{request_id}";
  const model = createSystemModel({
    systemName: "purchase-approvals",
    subsystems: current.scan.model.subsystems.map((subsystem) => ({
      key: subsystem.key,
      lens: subsystem.lens,
      name: subsystem.name,
    })),
    elements: [
      ...current.scan.model.elements.map((element) => ({
        subsystemKey: current.scan.model.subsystems.find((s) => s.id === element.subsystemId)?.key,
        key: element.key,
        kind: element.kind,
        roles: element.roles,
        name: element.name,
        evidence: element.evidence,
        claimState: element.claimState,
        capability: element.capability,
      })),
      {
        subsystemKey: "api",
        key: DELETE,
        kind: "operation",
        roles: ["interface", "behavior"],
        name: DELETE,
        evidence: [{ file: "app/main.py", line: 99, symbol: "delete_request" }],
        claimState: "observed",
        capability: "api.operation",
      },
    ],
  });
  const report = reconcile({
    model,
    seed: seedInput.seed,
    realization,
  });
  assert.ok(report.surfaces.unaccounted.some((item) => item.key === DELETE));
  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: report,
    completionReport: report,
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.ok(gate.reasons.some((reason) => reason.includes("unaccounted-surface")));
});

test("a fake successful builder test does not change the gate verdict", async () => {
  const seedInput = readSeed(fixture);
  const realization = readRealization(fixture, { seed: seedInput.seed }).realization;
  const current = await analyzeCurrent(fixture, { jobs: 1, cache: false });
  const scenarioRun = {
    id: "verify:fake",
    scenarios: seedInput.seed.scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      result: "failed",
      reasons: ["authorization inverted"],
    })),
    builderTests: [{ name: "builder says ok", passed: true }],
  };
  const report = reconcile({
    model: current.scan.model,
    seed: seedInput.seed,
    realization,
    scenarioRun,
  });
  assert.equal(report.scenarios.summary.failed, seedInput.seed.scenarios.length);
  assert.deepEqual(report.scenarios.builderTests, scenarioRun.builderTests);
  const gate = evaluateBuildGate({
    startModel: current.scan.model,
    completionModel: current.scan.model,
    startReport: report,
    completionReport: report,
    scenarioRun,
  });
  assert.equal(gate.state, GATE_STATES.NEEDS_ATTENTION);
  assert.ok(gate.reasons.some((reason) => reason.startsWith("scenario-failed:")));
});
