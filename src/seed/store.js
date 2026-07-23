import fs from "node:fs";
import path from "node:path";
import { canonicalStringifySeed, canonicalizeSeed } from "./canonicalize.js";
import { seedContentHash } from "./identity.js";
import { SEED_FILE } from "./schema.js";
import { validateSeed } from "./validate.js";

// The seed file lifecycle: the store only ever touches the fixed seed file at
// the repository root, writes are atomic (temp file + rename), and Git — not
// Varai — supplies history.

export function seedPath(repoPath) {
  const root = path.resolve(repoPath);
  const target = path.resolve(root, SEED_FILE);
  if (path.dirname(target) !== root) throw new Error(`Seed path escapes the repository root: ${target}`);
  return target;
}

export function readSeed(repoPath) {
  const target = seedPath(repoPath);
  if (!fs.existsSync(target)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (err) {
    throw new Error(`Cannot parse ${SEED_FILE}: ${err.message}`);
  }
  const { contentHash } = validateSeed(parsed);
  return {
    seed: parsed,
    path: target,
    contentHash,
    ratified: parsed.ratification?.status === "ratified",
  };
}

function atomicWrite(target, content) {
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content, "utf8");
  try {
    fs.renameSync(temporary, target);
  } catch (err) {
    try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    throw err;
  }
}

// writeSeed validates, canonicalizes, and atomically replaces the seed file.
// A ratified write must carry the current content hash.
export function writeSeed(repoPath, seed) {
  validateSeed(seed);
  const target = seedPath(repoPath);
  atomicWrite(target, canonicalStringifySeed(canonicalizeSeed(seed)));
  return { path: target, contentHash: seedContentHash(seed) };
}

// ratifySeed is the only ratification path: it stamps the reviewed draft with
// the computed semantic content hash and writes it as one canonical document.
export function ratifySeed(repoPath, draft, { ratifiedAt } = {}) {
  const contentHash = seedContentHash(draft);
  const seed = {
    formatVersion: draft.formatVersion,
    system: draft.system,
    concepts: draft.concepts ?? [],
    commitments: draft.commitments ?? [],
    context: draft.context ?? [],
    ratification: {
      status: "ratified",
      contentHash,
      ...(ratifiedAt ? { ratifiedAt } : {}),
    },
  };
  return { ...writeSeed(repoPath, seed), seed };
}
