import path from "node:path";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";
import { analyzeCurrent } from "../snapshots/snapshot.js";
import { readRealization } from "../reconciliation/witness-store.js";
import { readSeed } from "../seed/store.js";
import { runHttpScenarios } from "./http-runner.js";
import { readRuntimeMap } from "./load.js";
import { resolveRuntimeOperations } from "./resolve.js";
import { renderScenarioVerifyText, scenariosSummary } from "./report.js";
import { createVerificationStore } from "./store.js";

function runId({ seedHash, runtimeMapHash, scannedTreeHash, createdAt }) {
  return `verify:${semanticHash(canonicalStringify({ seedHash, runtimeMapHash, scannedTreeHash, createdAt })).slice(0, 20)}`;
}

export async function runVerifyScenarios(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const seedInput = readSeed(repoPath);
  if (!seedInput) throw new Error("Scenario verification requires varai.seed.json");
  if (!seedInput.ratified) throw new Error("Scenario verification requires a ratified Seed");
  if (seedInput.seed.formatVersion < 3) throw new Error("Scenario verification requires Seed format version 3");

  const runtimeInput = readRuntimeMap(repoPath, { expectedSeedHash: seedInput.contentHash });
  if (!runtimeInput) throw new Error("Scenario verification requires varai.runtime.json");

  const realizationInput = readRealization(repoPath, { seed: seedInput.seed });
  if (!realizationInput) throw new Error("Scenario verification requires varai.realization.json");

  const current = options.current ?? await analyzeCurrent(repoPath, options);
  const model = current.scan.model;
  const resolution = resolveRuntimeOperations({
    model,
    seed: seedInput.seed,
    realization: realizationInput.realization,
    runtime: runtimeInput.runtime,
    seedHash: seedInput.contentHash,
  });

  const store = createVerificationStore(repoPath);
  const runtimeMapHash = await store.putObject(runtimeInput.runtime);
  const createdAt = new Date().toISOString();

  let scenarioResults;
  if (!resolution.ok) {
    scenarioResults = (seedInput.seed.scenarios ?? []).map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      result: "could_not_run",
      reasons: resolution.problems.map((problem) => problem.message),
      steps: [],
      startedAt: createdAt,
      finishedAt: createdAt,
    }));
  } else {
    const executed = await runHttpScenarios({
      repoPath,
      runtime: runtimeInput.runtime,
      operations: resolution.operations,
      scenarios: seedInput.seed.scenarios ?? [],
      env: options.env ?? process.env,
    });
    scenarioResults = executed.results;
  }

  const runRecord = {
    formatVersion: 1,
    id: runId({
      seedHash: seedInput.contentHash,
      runtimeMapHash,
      scannedTreeHash: current.scannedTreeHash,
      createdAt,
    }),
    createdAt,
    systemName: seedInput.seed.system?.name ?? seedInput.seed.system?.id,
    seedHash: seedInput.contentHash,
    scannedTreeHash: current.scannedTreeHash,
    implementationTreeHash: current.implementationTreeHash,
    scanConfigHash: current.scanConfigHash,
    runtimeMapHash,
    resolutionProblems: resolution.problems,
    scenarios: scenarioResults,
    // Optional supporting metadata only — never a verdict source.
    builderTests: options.builderTests ?? [],
  };
  runRecord.contentHash = semanticHash(canonicalStringify({
    ...runRecord,
    contentHash: undefined,
  }));
  await store.putRun(runRecord);

  const summary = scenariosSummary(scenarioResults);
  const exitCode = summary.failed > 0 || summary.couldNotRun > 0 ? 1 : 0;
  if (!options.quiet) {
    if (options.json) process.stdout.write(`${JSON.stringify(runRecord, null, 2)}\n`);
    else process.stdout.write(renderScenarioVerifyText(runRecord));
  }
  return { run: runRecord, exitCode, summary };
}

export async function loadLatestScenarioRun(repoPath) {
  const store = createVerificationStore(repoPath);
  return store.getLatest();
}
