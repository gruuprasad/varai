import assert from "node:assert/strict";
import test from "node:test";
import { resolveSnapshotSelector } from "../../src/snapshots/selectors.js";

const snapshots = [
  { id: "abcdef111", semanticObjectHash: "111111", createdAt: "2026-01-02" },
  { id: "abcdef222", semanticObjectHash: "222222", createdAt: "2026-01-01" },
];
const store = {
  listSnapshots: async () => snapshots,
  getCommitRef: async (value) => value === "deadbeef" ? { snapshotId: "abcdef111" } : null,
  getSnapshot: async (id) => snapshots.find((item) => item.id === id),
};

test("resolves last and commit selectors", async () => {
  assert.equal((await resolveSnapshotSelector(store, "last")).id, "abcdef111");
  assert.equal((await resolveSnapshotSelector(store, "deadbeef")).id, "abcdef111");
});

test("rejects missing and ambiguous prefixes", async () => {
  await assert.rejects(() => resolveSnapshotSelector(store, "missing"), /No semantic snapshot matches/);
  await assert.rejects(() => resolveSnapshotSelector(store, "abcdef"), /ambiguous/);
});
