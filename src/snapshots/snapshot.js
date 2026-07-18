import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { scanRepo } from "../scanners/index.js";
import { loadRepoConfig } from "../scanners/config.js";
import { canonicalStringify } from "../ir/canonicalize.js";
import { semanticHash, stableId } from "../ir/identity.js";
import { validateAnalysisIR } from "../ir/validate.js";
import { readGitState } from "./git-state.js";
import { createSnapshotStore, SNAPSHOT_FORMAT_VERSION } from "./store.js";

function configForHash(value) {
  if (value instanceof RegExp) return { pattern: value.source, flags: value.flags };
  if (Array.isArray(value)) return value.map(configForHash);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, configForHash(v)]));
  return value;
}

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

async function intentArtifacts(repoPath, configured = []) {
  const artifacts = [];
  for (const file of [...configured].sort()) {
    try {
      const content = await readFile(path.join(repoPath, file));
      artifacts.push({ path: file, hash: semanticHash(content) });
    } catch (err) {
      artifacts.push({ path: file, missing: true, diagnostic: err.code ?? err.message });
    }
  }
  return artifacts;
}

export async function analyzeCurrent(repoPath, options = {}) {
  const config = options.config ?? await loadRepoConfig(repoPath);
  const include = options.include?.length ? options.include : (config.include ?? []);
  const scan = await scanRepo(repoPath, { ...options, include, config });
  const git = await readGitState(repoPath);
  const scanConfigHash = semanticHash(canonicalStringify(configForHash({ include, stock: config.stock ?? {} })));
  const artifacts = await intentArtifacts(repoPath, config.intentArtifacts ?? []);
  scan.analysis = validateAnalysisIR({
    ...scan.analysis,
    intentArtifacts: artifacts.map((artifact) => ({
      id: stableId("intent", artifact.path),
      ...artifact,
    })),
  });
  return {
    config,
    scan,
    git,
    scannedTreeHash: await hashScannedTree(repoPath, scan.files),
    scanConfigHash,
    intentArtifacts: artifacts,
  };
}

export async function createSnapshot(repoPath, options = {}) {
  const current = await analyzeCurrent(repoPath, options);
  return persistCurrentAnalysis(repoPath, current);
}

export async function persistCurrentAnalysis(repoPath, current) {
  const store = createSnapshotStore(current.git.semanticStoreRoot ?? repoPath);
  const semanticObjectHash = await store.putObject(current.scan.analysis);
  const identity = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    semanticObjectHash,
    git: { head: current.git.head, clean: current.git.clean },
    scannedTreeHash: current.scannedTreeHash,
    scanConfigHash: current.scanConfigHash,
    intentArtifacts: current.intentArtifacts,
  };
  const manifest = {
    ...identity,
    id: semanticHash(canonicalStringify(identity)).slice(0, 24),
    createdAt: new Date().toISOString(),
    git: { ...identity.git, statusLines: current.git.statusLines },
  };
  await store.putSnapshot(manifest);
  return { manifest, analysis: current.scan.analysis };
}
