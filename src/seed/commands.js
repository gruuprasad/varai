import fs from "node:fs";
import path from "node:path";
import { loadLatestReadyBaseline } from "../build-session/commands.js";
import { emitHandoffSchemas } from "../reconciliation/json-schema.js";
import { renderBuildPacket, renderBuildPacketJson } from "./handoff.js";
import { SEED_FILE } from "./schema.js";
import { ratifySeed, readSeed, seedPath } from "./store.js";
import { migrateSeedToCurrent } from "./migrate.js";
import { canonicalStringifySeed, canonicalizeSeed } from "./canonicalize.js";
import { writeSeed } from "./store.js";
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
      process.stderr.write(`This spec (${SEED_FILE}) has problems:\n`);
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
  const status = result.ratified ? "approved" : "draft";
  process.stdout.write(`Spec ${SEED_FILE} is valid (${status})\n`);
  process.stdout.write(`  fingerprint ${result.contentHash}\n`);
  process.stdout.write(`  ${seed.concepts.length} things, ${seed.commitments.length} requirements, ${(seed.context ?? []).length} notes\n`);
  if (!result.ratified) {
    process.stderr.write("Note: this spec is still a draft; the check only trusts an approved spec.\n");
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
      process.stderr.write(`This spec (${SEED_FILE}) has problems; fix them before approving:\n`);
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
    process.stdout.write(`Already approved at ${result.contentHash}\n`);
    return result;
  }
  const ratified = ratifySeed(repoPath, result.seed, { ratifiedAt: new Date().toISOString() });
  process.stdout.write(`Approved ${SEED_FILE}\n  fingerprint ${ratified.contentHash}\n`);
  return ratified;
}

// Seed format migration is explicit. Without --write it prints the exact draft
// document for review; with --write it atomically writes an unapproved v2 Seed.
export async function runSeedMigrate(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const input = readSeed(repoPath);
  if (!input) {
    process.stderr.write(`No ${SEED_FILE} found at ${seedPath(repoPath)}\n`);
    process.exitCode = 1;
    return null;
  }
  const migrated = migrateSeedToCurrent(input.seed);
  if (options.write) {
    const result = writeSeed(repoPath, migrated);
    process.stdout.write(`Migrated ${SEED_FILE} to format ${migrated.formatVersion} as an unapproved draft\n  fingerprint ${result.contentHash}\n`);
    return { ...result, seed: migrated };
  }
  process.stdout.write(canonicalStringifySeed(canonicalizeSeed(migrated)));
  return migrated;
}

// CLI runner for `varai handoff`: renders the vendor-neutral build packet for
// the ratified seed. The packet never carries unratified draft content.
// `--schema` prints the structural JSON Schemas for builder witnesses and
// runtime maps; `--json` adds the full seed diff against the latest prior
// `ready` session and carry-forward candidates.
export async function runHandoff(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const result = readSeed(repoPath);
  if (!result) {
    process.stderr.write(`No ${SEED_FILE} found at ${seedPath(repoPath)}\n`);
    process.exitCode = 1;
    return null;
  }
  const brief = options.brief ? fs.readFileSync(path.resolve(options.brief), "utf8") : undefined;
  if (options.schema) {
    process.stdout.write(`${JSON.stringify(emitHandoffSchemas(), null, 2)}\n`);
    return emitHandoffSchemas();
  }
  if (options.json) {
    const baseline = await loadLatestReadyBaseline(repoPath);
    let packet;
    try {
      packet = renderBuildPacketJson({ seed: result.seed, brief, baseline });
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
      return null;
    }
    process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    return packet;
  }
  let packet;
  try {
    packet = renderBuildPacket({ seed: result.seed, brief });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
    return null;
  }
  process.stdout.write(packet);
  return packet;
}
