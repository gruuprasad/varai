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
import { runVerifyScenarios } from "../../src/runtime/commands.js";

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/purchase-approval-runtime");

async function loadResolved() {
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
  assert.equal(resolution.ok, true, resolution.problems.map((p) => p.message).join("; "));
  return { seedInput, runtime, resolution, current };
}

test("correct owner-only withdrawal scenarios pass on the fixture app", async () => {
  const { seedInput, runtime, resolution } = await loadResolved();
  const { results } = await runHttpScenarios({
    repoPath: fixture,
    runtime,
    operations: resolution.operations,
    scenarios: seedInput.seed.scenarios,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
      VARAI_POC_EMPLOYEE_1_TOKEN: "fixture-employee-1-token",
      VARAI_POC_EMPLOYEE_2_TOKEN: "fixture-employee-2-token",
    },
  });
  assert.equal(results.every((item) => item.result === "passed"), true, JSON.stringify(results, null, 2));
});

test("verify scenarios CLI path stores a passing run record", async () => {
  const { run, exitCode } = await runVerifyScenarios({
    repo: fixture,
    quiet: true,
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
      VARAI_POC_EMPLOYEE_1_TOKEN: "fixture-employee-1-token",
      VARAI_POC_EMPLOYEE_2_TOKEN: "fixture-employee-2-token",
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(run.scenarios.every((item) => item.result === "passed"), true);
  assert.ok(run.contentHash);
  assert.ok(!JSON.stringify(run).includes("fixture-employee-1-token"));
});
