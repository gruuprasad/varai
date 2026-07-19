import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { scanRepo } from "../scanners/index.js";
import { loadRepoConfig } from "../scanners/config.js";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";
import { validateSystemModel } from "../system-model/validate.js";
import { readGitState } from "./git-state.js";
import { createSnapshotStore, SNAPSHOT_FORMAT_VERSION } from "./store.js";

async function hashScannedTree(repoPath, files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(path.join(repoPath, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function analyzeCurrent(repoPath, options = {}) {
  const config = options.config ?? await loadRepoConfig(repoPath);
  const include = options.include?.length ? options.include : (config.include ?? []);
  const exclude = options.exclude?.length ? options.exclude : (config.exclude ?? []);
  const scan = await scanRepo(repoPath, { ...options, include, exclude });
  const git = await readGitState(repoPath);
  return {
    config,
    scan,
    git,
    scannedTreeHash: await hashScannedTree(repoPath, scan.files),
    scanConfigHash: semanticHash(canonicalStringify({ include: [...include].sort(), exclude: [...exclude].sort() })),
  };
}

export async function createSnapshot(repoPath, options = {}) {
  return persistCurrentModel(repoPath, await analyzeCurrent(repoPath, options));
}

export async function persistCurrentModel(repoPath, current) {
  const store = createSnapshotStore(current.git.semanticStoreRoot ?? repoPath);
  const model = validateSystemModel(current.scan.model);
  const modelObjectHash = await store.putObject(model);
  const identity = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    modelObjectHash,
    modelSchemaVersion: model.schemaVersion,
    git: { head: current.git.head, clean: current.git.clean },
    scannedTreeHash: current.scannedTreeHash,
    scanConfigHash: current.scanConfigHash,
  };
  const manifest = {
    ...identity,
    id: semanticHash(canonicalStringify(identity)).slice(0, 24),
    createdAt: new Date().toISOString(),
    git: { ...identity.git, statusLines: current.git.statusLines },
  };
  await store.putSnapshot(manifest);
  return { manifest, model };
}
