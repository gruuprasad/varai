// Semantic diff between two seed documents (typically ratified vs draft).
// Identity is the stable id: a renamed concept is a change, never a delete
// plus an add. Output ordering is deterministic.

function byId(items) {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

function semanticEquals(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffCollection(beforeItems, afterItems) {
  const before = byId(beforeItems);
  const after = byId(afterItems);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, item] of [...after.entries()].sort()) {
    if (!before.has(id)) added.push(item);
    else if (!semanticEquals(before.get(id), item)) changed.push({ before: before.get(id), after: item });
  }
  for (const [id, item] of [...before.entries()].sort()) {
    if (!after.has(id)) removed.push(item);
  }
  return { added, removed, changed };
}

export function diffSeeds(before, after) {
  const empty = { concepts: [], commitments: [], context: [] };
  const from = before ?? empty;
  return {
    systemChanged: Boolean(before) && !semanticEquals(from.system, after.system),
    concepts: diffCollection(from.concepts, after.concepts),
    commitments: diffCollection(from.commitments, after.commitments),
    context: diffCollection(from.context, after.context),
  };
}

export function diffIsEmpty(diff) {
  return !diff.systemChanged &&
    ["concepts", "commitments", "context"]
      .every((key) => !diff[key].added.length && !diff[key].removed.length && !diff[key].changed.length);
}
