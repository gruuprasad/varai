function evidence(value) {
  const list = value?.evidence ?? [];
  return list.map((ev) => `${ev.file}${ev.line ? `:${ev.line}` : ""}`).join(", ") || "no evidence";
}

function clauseLabel(kind, clause) {
  if (kind === "requires") return `needs ${clause.name}`;
  if (kind === "takes" || kind === "gives") return `${kind} ${clause.schema ?? clause.name ?? "unknown"}`;
  if (kind === "reads" || kind === "writes") return `${kind} ${clause.medium}:${clause.target ?? clause.detail ?? "unknown"}`;
  if (kind === "fails") return `fails ${clause.status ?? clause.reason ?? "unknown"}`;
  if (kind === "untraced") return `untraced ${clause.call}`;
  return kind;
}

export function renderSemanticDiff(diff, context = {}) {
  const lines = ["# Semantic Diff", ""];
  if (context.from || context.to) lines.push(`From: ${context.from ?? "unknown"}  `, `To: ${context.to ?? "current"}`, "");
  for (const warning of diff.warnings) lines.push(`> Warning: ${warning}`, "");
  if (!diff.summary.hasChanges) return lines.concat("No semantic changes.", "").join("\n");
  lines.push(`Behaviors: +${diff.summary.behaviorsAdded} -${diff.summary.behaviorsRemoved} ~${diff.summary.behaviorsChanged}`, "");
  for (const behavior of diff.behaviors.added) lines.push(`## + ${behavior.door.method} ${behavior.door.path}`, "", `Evidence: ${evidence(behavior.door)}`, "");
  for (const behavior of diff.behaviors.removed) lines.push(`## - ${behavior.door.method} ${behavior.door.path}`, "", `Evidence: ${evidence(behavior.door)}`, "");
  for (const behavior of diff.behaviors.changed) {
    lines.push(`## ~ ${behavior.door.method} ${behavior.door.path}`, "");
    const rank = { "claim-state": 0, added: 1, removed: 2, "evidence-moved": 3 };
    for (const change of [...behavior.clauses].sort((a, b) => rank[a.change] - rank[b.change])) {
      if (change.change === "claim-state") {
        lines.push(`- ! ${clauseLabel(change.kind, change.after)}: ${change.before.claimState} -> ${change.after.claimState} (${evidence(change.after)})`);
      } else if (change.change === "evidence-moved") {
        lines.push(`- > ${change.kind} evidence moved: ${evidence(change.before)} -> ${evidence(change.after)}`);
      } else {
        const marker = change.change === "added" ? "+" : "-";
        lines.push(`- ${marker} ${clauseLabel(change.kind, change.clause)} (${evidence(change.clause)})`);
      }
    }
    lines.push("");
  }
  if (diff.states.added.length || diff.states.removed.length || diff.states.changed.length) {
    lines.push("## State locations", "");
    for (const state of diff.states.added) lines.push(`- + ${state.medium}:${state.target}`);
    for (const state of diff.states.removed) lines.push(`- - ${state.medium}:${state.target}`);
    for (const state of diff.states.changed) lines.push(`- ~ ${state.after.medium}:${state.after.target}`);
    lines.push("");
  }
  if (diff.patterns.added.length || diff.patterns.removed.length || diff.patterns.changed.length) {
    lines.push("## Standard patterns", "");
    for (const item of diff.patterns.added) lines.push(`- + ${item.name}`);
    for (const item of diff.patterns.removed) lines.push(`- - ${item.name}`);
    for (const item of diff.patterns.changed) lines.push(`- ~ ${item.after.name}`);
    lines.push("");
  }
  if (diff.facts.added.length || diff.facts.removed.length || diff.facts.changed.length) {
    lines.push("## Supporting facts", "");
    for (const fact of diff.facts.added) lines.push(`- + ${fact.kind}: ${fact.name} (${evidence(fact)})`);
    for (const fact of diff.facts.removed) lines.push(`- - ${fact.kind}: ${fact.name} (${evidence(fact)})`);
    for (const fact of diff.facts.changed) lines.push(`- ~ ${fact.after.kind}: ${fact.after.name} (${evidence(fact.after)})`);
    lines.push("");
  }
  if (diff.intentArtifacts.added.length || diff.intentArtifacts.removed.length || diff.intentArtifacts.changed.length) {
    lines.push("## Intent artifacts", "");
    for (const item of diff.intentArtifacts.added) lines.push(`- + ${item.path}`);
    for (const item of diff.intentArtifacts.removed) lines.push(`- - ${item.path}`);
    for (const item of diff.intentArtifacts.changed) lines.push(`- ~ ${item.after.path}`);
    lines.push("");
  }
  return lines.join("\n");
}
