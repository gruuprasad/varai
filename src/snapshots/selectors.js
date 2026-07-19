export async function resolveSnapshotSelector(store, selector) {
  if (!selector) throw new Error("A snapshot selector is required");
  if (selector === "last") {
    const snapshots = await store.listSnapshots();
    if (!snapshots[0]) throw new Error("No semantic snapshots exist");
    return snapshots[0];
  }
  const ref = await store.getCommitRef(selector);
  if (ref) return store.getSnapshot(ref.snapshotId);
  const snapshots = await store.listSnapshots();
  const matches = snapshots.filter((item) => item.id === selector || item.id.startsWith(selector) ||
    item.modelObjectHash === selector || item.modelObjectHash.startsWith(selector));
  if (matches.length === 0) throw new Error(`No semantic snapshot matches "${selector}"`);
  if (matches.length > 1) throw new Error(`Semantic snapshot selector "${selector}" is ambiguous`);
  return matches[0];
}
