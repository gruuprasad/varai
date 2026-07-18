function semantic(item) {
  const { evidence, observationMethod, claimState, ...rest } = item;
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
    if (JSON.stringify(old.evidence) !== JSON.stringify(item.evidence)) return [{ change: "evidence-moved", before: old, after: item }];
    return [];
  });
  return { added, removed, changed };
}
