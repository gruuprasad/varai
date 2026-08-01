import path from "node:path";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";
import { analyzeCurrent } from "../snapshots/snapshot.js";
import { readRealization } from "../reconciliation/witness-store.js";
import { readSeed } from "../seed/store.js";
import { deriveRuntimeMap } from "./derive.js";
import { runHttpScenarios } from "./http-runner.js";
import { readRuntimeMap, runtimePath, writeRuntimeMapAtomically } from "./load.js";
import { resolveRuntimeOperations } from "./resolve.js";
import { renderScenarioVerifyText, scenariosSummary } from "./report.js";
import { createVerificationStore } from "./store.js";
import { validateRuntimeMap } from "./validate.js";

function runId({ seedHash, runtimeMapHash, scannedTreeHash, createdAt }) {
  return `verify:${semanticHash(canonicalStringify({ seedHash, runtimeMapHash, scannedTreeHash, createdAt })).slice(0, 20)}`;
}

/** Attach only evidence that matches the current Seed (and runtime map when known). */
export function selectFreshScenarioRun(run, { seedHash, runtimeMapHash } = {}) {
  if (!run || !seedHash) return null;
  if (run.seedHash !== seedHash) return null;
  if (runtimeMapHash && run.runtimeMapHash && run.runtimeMapHash !== runtimeMapHash) return null;
  return run;
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


// CLI runner for `varai runtime derive`: regenerate operation mappings while
// preserving stable profile fields. Without a baseline profile it reports the
// exact unresolved fields and exits non-zero — it never invents configuration.
export async function runRuntimeDerive(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const seedInput = readSeed(repoPath);
  if (!seedInput) throw new Error("runtime derive requires varai.seed.json");
  if (!seedInput.ratified) throw new Error("runtime derive requires a ratified Seed");
  const realizationInput = readRealization(repoPath, { seed: seedInput.seed });
  if (!realizationInput) throw new Error("runtime derive requires varai.realization.json");
  const current = options.current ?? await analyzeCurrent(repoPath, options);
  const runtimeInput = readRuntimeMap(repoPath, { expectedSeedHash: seedInput.contentHash });

  let baselineRuntime = null;
  const run = await loadLatestScenarioRun(repoPath, { seedHash: seedInput.contentHash });
  if (run?.runtimeMapHash) {
    const store = createVerificationStore(repoPath);
    try {
      baselineRuntime = await store.getObject(run.runtimeMapHash);
    } catch {
      baselineRuntime = null;
    }
  }

  const derived = deriveRuntimeMap({
    model: current.scan.model,
    seed: seedInput.seed,
    realization: realizationInput.realization,
    currentRuntime: runtimeInput?.runtime ?? null,
    baselineRuntime,
  });

  if (options.write) {
    if (!derived.runtime) {
      process.stderr.write("Cannot write a runtime map: profile fields are unresolved. Fix the reported fields, then derive again with --write.\n");
      process.exitCode = 1;
    } else {
      validateRuntimeMap(derived.runtime);
      writeRuntimeMapAtomically(repoPath, derived.runtime);
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(derived, null, 2)}\n`);
  } else {
    const lines = [`Runtime derive — spec ${derived.runtime?.seedHash?.slice(0, 16) ?? seedInput.contentHash.slice(0, 16)}…`];
    if (derived.runtime) {
      lines.push(`  profile: ${derived.profileSource} (preserved)`);
      for (const operation of derived.runtime.operations) {
        lines.push(`  ${operation.behavior} -> ${operation.method} ${operation.path}`);
      }
    }
    for (const field of derived.unresolved) lines.push(`  unresolved profile field: ${field}`);
    for (const problem of derived.problems) lines.push(`  [${problem.code}] ${problem.message}`);
    if (derived.ok) lines.push("Ready to write (--write) or use directly.");
    else lines.push("Not derivable yet — fix the unresolved fields and problems above.");
    process.stdout.write(`${lines.join("\n")}\n`);
  }
  if (!derived.ok) process.exitCode = 1;
  return derived;
}

export async function loadLatestScenarioRun(repoPath, { seedHash, runtimeMapHash } = {}) {
  const store = createVerificationStore(repoPath);
  const run = await store.getLatest();
  return selectFreshScenarioRun(run, { seedHash, runtimeMapHash });
}
