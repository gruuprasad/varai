import path from "node:path";
import { scanRepo } from "../scanners/index.js";
import { SEED_FILE } from "../seed/schema.js";
import { readSeed } from "../seed/store.js";
import { reconcile } from "./check.js";
import { renderCheckText } from "./report.js";
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
    process.stderr.write("Warning: the seed is not ratified; results describe unratified draft content.\n");
  }
  const realizationInput = readRealization(repoPath, { seed: seedInput.seed });
  const { model } = await scanRepo(repoPath, options);
  const report = reconcile({
    model,
    seed: seedInput.seed,
    realization: realizationInput?.realization ?? null,
  });
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(renderCheckText(report, { model }));
  if (report.summary.violated > 0) process.exitCode = 1;
  return report;
}
