export function summarizeDiff(diff) {
  const clauseChanges = diff.behaviors.changed.reduce((sum, item) => sum + item.clauses.length, 0);
  return {
    behaviorsAdded: diff.behaviors.added.length,
    behaviorsRemoved: diff.behaviors.removed.length,
    behaviorsChanged: diff.behaviors.changed.length,
    clauseChanges,
    factsAdded: diff.facts.added.length,
    factsRemoved: diff.facts.removed.length,
    statesChanged: diff.states.added.length + diff.states.removed.length + diff.states.changed.length,
    patternsChanged: diff.patterns.added.length + diff.patterns.removed.length + diff.patterns.changed.length,
    intentArtifactsChanged: diff.intentArtifacts.added.length + diff.intentArtifacts.removed.length + diff.intentArtifacts.changed.length,
    hasChanges: diff.behaviors.added.length + diff.behaviors.removed.length + clauseChanges +
      diff.facts.added.length + diff.facts.removed.length + diff.facts.changed.length +
      diff.states.added.length + diff.states.removed.length + diff.states.changed.length +
      diff.patterns.added.length + diff.patterns.removed.length + diff.patterns.changed.length +
      diff.intentArtifacts.added.length + diff.intentArtifacts.removed.length + diff.intentArtifacts.changed.length > 0,
  };
}
