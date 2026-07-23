import fs from "node:fs";
import path from "node:path";
import { renderBuildPacket } from "./handoff.js";
import { SEED_FILE } from "./schema.js";
import { ratifySeed, readSeed, seedPath } from "./store.js";
import { SeedValidationError } from "./validate.js";

// CLI runner for `varai seed validate`: reports every validation problem or
// confirms the seed with its semantic content hash. Exit code is set here so
// bin/varai.js stays a thin dispatcher.
export async function runSeedValidate(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  let result;
  try {
    result = readSeed(repoPath);
  } catch (err) {
    if (err instanceof SeedValidationError) {
      process.stderr.write(`Invalid ${SEED_FILE}:\n`);
      for (const problem of err.problems) {
        process.stderr.write(`  [${problem.code}] ${problem.message}\n`);
      }
    } else {
      process.stderr.write(`${err.message}\n`);
    }
    process.exitCode = 1;
    return null;
  }
  if (!result) {
    process.stderr.write(`No ${SEED_FILE} found at ${seedPath(repoPath)}\n`);
    process.exitCode = 1;
    return null;
  }
  const { seed } = result;
  const status = result.ratified ? "ratified" : "draft";
  process.stdout.write(`Valid ${SEED_FILE} (${status})\n`);
  process.stdout.write(`  content hash ${result.contentHash}\n`);
  process.stdout.write(`  ${seed.concepts.length} concepts, ${seed.commitments.length} commitments, ${(seed.context ?? []).length} context entries\n`);
  if (!result.ratified) {
    process.stderr.write("Note: the seed is a draft; reconciliation treats only ratified content as human-ratified intent.\n");
  }
  return result;
}

// CLI runner for `varai seed ratify`: stamps the reviewed draft with the
// semantic content hash. This is the only ratification path; Varai never
// ratifies on behalf of a human — the command IS the explicit human action.
export async function runSeedRatify(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  let result;
  try {
    result = readSeed(repoPath);
  } catch (err) {
    if (err instanceof SeedValidationError) {
      process.stderr.write(`Invalid ${SEED_FILE}; fix before ratifying:\n`);
      for (const problem of err.problems) {
        process.stderr.write(`  [${problem.code}] ${problem.message}\n`);
      }
    } else {
      process.stderr.write(`${err.message}\n`);
    }
    process.exitCode = 1;
    return null;
  }
  if (!result) {
    process.stderr.write(`No ${SEED_FILE} found at ${seedPath(repoPath)}\n`);
    process.exitCode = 1;
    return null;
  }
  if (result.ratified && result.seed.ratification.contentHash === result.contentHash) {
    process.stdout.write(`Already ratified at ${result.contentHash}\n`);
    return result;
  }
  const ratified = ratifySeed(repoPath, result.seed, { ratifiedAt: new Date().toISOString() });
  process.stdout.write(`Ratified ${SEED_FILE}\n  content hash ${ratified.contentHash}\n`);
  return ratified;
}

// CLI runner for `varai handoff`: renders the vendor-neutral build packet for
// the ratified seed. The packet never carries unratified draft content.
export async function runHandoff(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const result = readSeed(repoPath);
  if (!result) {
    process.stderr.write(`No ${SEED_FILE} found at ${seedPath(repoPath)}\n`);
    process.exitCode = 1;
    return null;
  }
  const brief = options.brief ? fs.readFileSync(path.resolve(options.brief), "utf8") : undefined;
  let packet;
  try {
    packet = renderBuildPacket({ seed: result.seed, brief });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
    return null;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ system: result.seed.system, contentHash: result.contentHash, packet }, null, 2)}\n`);
  } else {
    process.stdout.write(packet);
  }
  return packet;
}
