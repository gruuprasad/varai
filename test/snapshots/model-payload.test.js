import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { persistCurrentModel } from "../../src/snapshots/snapshot.js";
import { createSnapshotStore } from "../../src/snapshots/store.js";

test("snapshot manifest stores one canonical System Model object", async () => {
  const repo = await mkdtemp(path.join(tmpdir(), "varai-model-snapshot-"));
  try {
    const model = createSystemModel({ systemName: "fixture" });
    const result = await persistCurrentModel(repo, {
      git: { semanticStoreRoot: repo, head: "abc123", clean: true, statusLines: [] },
      scan: { model },
      scannedTreeHash: "tree",
      scanConfigHash: "config",
    });

    assert.equal(result.manifest.formatVersion, 1);
    assert.equal(result.manifest.modelSchemaVersion, 2);
    assert.equal(typeof result.manifest.modelObjectHash, "string");
    assert.equal("semanticObjectHash" in result.manifest, false);
    assert.equal("systemModelObjectHash" in result.manifest, false);

    const store = createSnapshotStore(repo);
    assert.deepEqual(await store.getObject(result.manifest.modelObjectHash), model);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
