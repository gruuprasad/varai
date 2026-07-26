// Diff-derived change highlighting, shared by every view that marks what moved
// since the last snapshot. Kept separate from any one view so retiring a view
// does not strand it.

export function collectChangedClaimIds(diff) {
  const ids = new Set();
  if (!diff) return ids;
  for (const item of diff.claims.added) ids.add(item.id);
  for (const item of diff.claims.removed) ids.add(item.id);
  for (const item of diff.claims.changed) ids.add(item.after.id);
  return ids;
}
