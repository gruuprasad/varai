const CLAIM_RANK = { observed: 0, inferred: 1, unverified: 2, ambiguous: 3 };

function jsonKey(value) {
  return JSON.stringify(value);
}

export function mergeEvidence(...values) {
  const merged = new Map();
  for (const item of values.flat(Infinity)) {
    if (!item?.file) continue;
    merged.set(jsonKey(item), item);
  }
  return [...merged.values()].sort((a, b) => jsonKey(a).localeCompare(jsonKey(b)));
}

export function leastConfident(a, b) {
  return CLAIM_RANK[a] >= CLAIM_RANK[b] ? a : b;
}

export function mergeCoverageState(states) {
  if (states.includes("failed")) return "failed";
  if (states.every((state) => state === "analyzed")) return "analyzed";
  if (states.every((state) => state === "unsupported")) return "unsupported";
  return "partial";
}

export function mergeDetails(...values) {
  return [...new Set(values.flat(Infinity).filter(Boolean).map(String))].sort();
}
