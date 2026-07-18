const CLAUSE_KINDS = ["requires", "takes", "gives", "reads", "writes", "fails", "untraced"];

function byId(items) { return new Map(items.map((item) => [item.id, item])); }
function evidenceKey(value) { return JSON.stringify(value ?? []); }

export function diffBehaviors(before, after) {
  const oldMap = byId(before);
  const newMap = byId(after);
  const added = after.filter((item) => !oldMap.has(item.id));
  const removed = before.filter((item) => !newMap.has(item.id));
  const changed = [];

  for (const current of after) {
    const previous = oldMap.get(current.id);
    if (!previous) continue;
    const clauses = [];
    for (const kind of CLAUSE_KINDS) {
      const oldClauses = byId(previous[kind]);
      const newClauses = byId(current[kind]);
      for (const clause of current[kind]) {
        const oldClause = oldClauses.get(clause.id);
        if (!oldClause) clauses.push({ change: "added", kind, clause });
        else if (oldClause.claimState !== clause.claimState) {
          clauses.push({ change: "claim-state", kind, before: oldClause, after: clause });
        } else if (evidenceKey(oldClause.evidence) !== evidenceKey(clause.evidence)) {
          clauses.push({ change: "evidence-moved", kind, before: oldClause, after: clause });
        }
      }
      for (const clause of previous[kind]) {
        if (!newClauses.has(clause.id)) clauses.push({ change: "removed", kind, clause });
      }
    }
    if (evidenceKey(previous.door.evidence) !== evidenceKey(current.door.evidence)) {
      clauses.push({ change: "evidence-moved", kind: "door", before: previous.door, after: current.door });
    }
    if (clauses.length) changed.push({ id: current.id, door: current.door, clauses });
  }
  return { added, removed, changed };
}
