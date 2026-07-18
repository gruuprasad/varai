import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createAnalysisIR } from "../../src/ir/canonicalize.js";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { persistCurrentAnalysis } from "../../src/snapshots/snapshot.js";
import { createSnapshotStore } from "../../src/snapshots/store.js";

test("snapshot manifest v2 stores Analysis IR and System Model objects", async () => {
  const repo = await mkdtemp(path.join(tmpdir(), "varai-dual-snapshot-"));
  try {
    const analysis = createAnalysisIR({ scanContext: {}, facts: [] });
    const systemModel = createSystemModel({ systemName: "fixture" });
    const result = await persistCurrentAnalysis(repo, {
      git: { semanticStoreRoot: repo, head: "abc123", clean: true, statusLines: [] },
      scan: { analysis, systemModel },
      scannedTreeHash: "tree",
      scanConfigHash: "config",
      intentArtifacts: [],
    });
    assert.equal(result.manifest.formatVersion, 2);
    assert.equal(result.manifest.systemModelSchemaVersion, 1);
    assert.notEqual(result.manifest.semanticObjectHash, result.manifest.systemModelObjectHash);

    const store = createSnapshotStore(repo);
    assert.deepEqual(await store.getObject(result.manifest.semanticObjectHash), analysis);
    assert.deepEqual(await store.getObject(result.manifest.systemModelObjectHash), systemModel);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
