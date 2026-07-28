import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

test("returning 403 without preserving state fails the follow-up state assertion", async () => {
  const { results } = await runScenarios("corrupt_deny");
  const nonOwner = results.find((item) => item.id === "scenario.non-owner-cannot-withdraw");
  assert.equal(nonOwner.result, "failed");
  assert.ok(
    nonOwner.reasons.some((reason) => /state|pending|withdrawn|body/.test(reason)),
    JSON.stringify(nonOwner.reasons),
  );
});

test("omitting audit creation fails the audit-observation step", async () => {
  const { results } = await runScenarios("omit_audit");
  const audit = results.find((item) => item.id === "scenario.withdrawal-is-recorded");
  assert.equal(audit.result, "failed");
  assert.ok(
    audit.reasons.some((reason) => /entries|decision|body|history/.test(reason)),
    JSON.stringify(audit.reasons),
  );
});
