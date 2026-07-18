function semantic(item) {
  const { evidence, observationMethod, ...rest } = item;
  return JSON.stringify(rest);
}

export function diffFacts(before, after) {
  const oldMap = new Map(before.map((item) => [item.id, item]));
  const newMap = new Map(after.map((item) => [item.id, item]));
  const added = after.filter((item) => !oldMap.has(item.id));
  const removed = before.filter((item) => !newMap.has(item.id));
  const changed = after.flatMap((item) => {
    const old = oldMap.get(item.id);
    if (!old) return [];
    if (semantic(old) !== semantic(item)) return [{ change: "semantic", before: old, after: item }];
    return [];
  });
  const evidenceChanged = after.flatMap((item) => {
    const old = oldMap.get(item.id);
    return old && JSON.stringify(old.evidence) !== JSON.stringify(item.evidence)
      ? [{ change: "evidence-moved", before: old, after: item }]
      : [];
  });
  return { added, removed, changed, evidenceChanged };
}
