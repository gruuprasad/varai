import path from "node:path";
import { analyzeCurrent } from "../snapshots/snapshot.js";
import { findBuildProvenance } from "../build-session/commands.js";
import { SEED_FILE } from "../seed/schema.js";
import { readSeed } from "../seed/store.js";
import { loadLatestScenarioRun } from "../runtime/commands.js";
import { reconcile } from "./check.js";
import { lintRealization, lintIsActionable } from "./lint.js";
import { renderCheckText, renderLintText } from "./report.js";
import { readRealization } from "./witness-store.js";

// CLI runner for `varai check`: scan the repository, load the ratified seed
// and any builder witness, then render the deterministic reconciliation. No
// LLM participates; the process exits non-zero when any commitment is
// violated under analyzed coverage.
export async function runCheck(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const seedInput = readSeed(repoPath);
  if (!seedInput) {
    process.stderr.write(`No ${SEED_FILE} found at ${repoPath}; reconciliation needs a validated seed.\n`);
    process.exitCode = 1;
    return null;
  }
  if (!seedInput.ratified) {
    process.stderr.write("Note: this spec is still a draft; results describe an unapproved draft.\n");
  }
  const realizationInput = readRealization(repoPath, { seed: seedInput.seed });
  const current = await analyzeCurrent(repoPath, options);
  const { model } = current.scan;
  const provenance = await findBuildProvenance(repoPath, {
    seedHash: seedInput.contentHash,
    scannedTreeHash: current.scannedTreeHash,
    scanConfigHash: current.scanConfigHash,
    realization: realizationInput?.realization ?? null,
  });
  const scenarioRun = options.scenarioRun ?? await loadLatestScenarioRun(repoPath, {
    seedHash: seedInput.contentHash,
  });
  const report = reconcile({
    model,
    seed: seedInput.seed,
    realization: realizationInput?.realization ?? null,
    provenance,
    scenarioRun,
  });
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(renderCheckText(report, { model }));
  if (report.summary.violated > 0) process.exitCode = 1;
  return report;
}

// CLI runner for `varai realization lint <file>`: schema, seed references,
// hash, current-model resolution, and deterministic candidates in one
// read-only command. Exits non-zero whenever the witness is not actionable.
export async function runRealizationLint(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  if (!options.file) {
    process.stderr.write("realization lint requires the witness file path.\n");
    process.exitCode = 1;
    return null;
  }
  const witnessPath = path.resolve(options.file);
  const seedInput = readSeed(repoPath);
  if (!seedInput) {
    process.stderr.write(`No ${SEED_FILE} found at ${repoPath}; lint needs the seed to resolve references.\n`);
    process.exitCode = 1;
    return null;
  }
  let realization;
  try {
    realization = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(witnessPath, "utf8")));
  } catch (err) {
    process.stderr.write(`Cannot read witness ${witnessPath}: ${err.message}\n`);
    process.exitCode = 1;
    return null;
  }
  const current = await analyzeCurrent(repoPath, options);
  const lint = lintRealization({ model: current.scan.model, seed: seedInput.seed, realization });
  const actionable = lintIsActionable(lint);
  if (options.json) process.stdout.write(`${JSON.stringify(lint, null, 2)}\n`);
  else process.stdout.write(renderLintText(lint, { model: current.scan.model }));
  if (!actionable) process.exitCode = 1;
  return lint;
}

