import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createSnapshotStore } from "../../src/snapshots/store.js";
import { createSystemModel } from "../../src/system-model/canonicalize.js";

test("content-addressed store reuses identical semantic objects", async () => {
  const repo = await mkdtemp(path.join(tmpdir(), "varai-store-"));
  try {
    const store = createSnapshotStore(repo);
    const model = createSystemModel({ systemName: "fixture" });
    const a = await store.putObject(model);
    const b = await store.putObject(model);
    assert.equal(a, b);
    assert.deepEqual(await store.getObject(a), model);
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test("dirty snapshots do not overwrite clean commit refs", async () => {
  const repo = await mkdtemp(path.join(tmpdir(), "varai-store-"));
  try {
    const store = createSnapshotStore(repo);
    const base = { formatVersion: 1, modelObjectHash: "a", modelSchemaVersion: 1, scannedTreeHash: "t", scanConfigHash: "c", createdAt: "2026-01-01T00:00:00Z" };
    await store.putSnapshot({ ...base, id: "clean", git: { head: "abc", clean: true } });
    await store.putSnapshot({ ...base, id: "dirty", git: { head: "abc", clean: false } });
    assert.deepEqual(await store.getCommitRef("abc"), { snapshotId: "clean" });
  } finally { await rm(repo, { recursive: true, force: true }); }
});
