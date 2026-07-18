import { clauseLabel, doorLabel } from "../ir/behavior-schema.js";

function evidence(value) {
  const list = value?.evidence ?? [];
  return list.map((ev) => `${ev.file}${ev.line ? `:${ev.line}` : ""}`).join(", ") || "no evidence";
}

export function renderSemanticDiff(diff, context = {}) {
  const lines = ["# Semantic Diff", ""];
  if (context.from || context.to) lines.push(`From: ${context.from ?? "unknown"}  `, `To: ${context.to ?? "current"}`, "");
  for (const warning of diff.warnings) lines.push(`> Warning: ${warning}`, "");
  if (!diff.summary.hasChanges) {
    lines.push("No semantic changes.", "");
    if (diff.summary.hasEvidenceChanges && !context.showEvidenceMoves) {
      lines.push(`_${diff.summary.evidenceChanges} evidence locations moved; use --show-evidence-moves to inspect._`, "");
    }
    if (context.showEvidenceMoves) renderEvidenceChanges(lines, diff);
    return lines.join("\n");
  }
  lines.push(`Behaviors: +${diff.summary.behaviorsAdded} -${diff.summary.behaviorsRemoved} ~${diff.summary.behaviorsChanged}`, "");
  for (const behavior of diff.behaviors.added) lines.push(`## + ${doorLabel(behavior.door)}`, "", `Evidence: ${evidence(behavior.door)}`, "");
  for (const behavior of diff.behaviors.removed) lines.push(`## - ${doorLabel(behavior.door)}`, "", `Evidence: ${evidence(behavior.door)}`, "");
  for (const behavior of diff.behaviors.changed) {
    lines.push(`## ~ ${doorLabel(behavior.door)}`, "");
    const rank = { "claim-state": 0, added: 1, removed: 2 };
    for (const change of [...behavior.clauses].sort((a, b) => rank[a.change] - rank[b.change])) {
      if (change.change === "claim-state") {
        lines.push(`- ! ${clauseLabel(change.kind, change.after)}: ${change.before.claimState} -> ${change.after.claimState} (${evidence(change.after)})`);
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
  if (diff.summary.hasEvidenceChanges && context.showEvidenceMoves) renderEvidenceChanges(lines, diff);
  else if (diff.summary.hasEvidenceChanges) lines.push(`_${diff.summary.evidenceChanges} evidence locations moved; use --show-evidence-moves to inspect._`, "");
  return lines.join("\n");
}

function renderEvidenceChanges(lines, diff) {
  lines.push("## Evidence movement", "");
  for (const behavior of diff.behaviors.evidenceChanged) {
    lines.push(`### ${doorLabel(behavior.door)}`, "");
    for (const change of behavior.changes) {
      lines.push(`- ${change.kind}: ${evidence(change.before)} -> ${evidence(change.after)}`);
    }
    lines.push("");
  }
  for (const fact of diff.facts.evidenceChanged) {
    lines.push(`- fact ${fact.after.kind}:${fact.after.name}: ${evidence(fact.before)} -> ${evidence(fact.after)}`);
  }
  for (const state of diff.states.evidenceChanged) {
    lines.push(`- state ${state.after.medium}:${state.after.target}: ${evidence(state.before)} -> ${evidence(state.after)}`);
  }
  if (diff.facts.evidenceChanged.length || diff.states.evidenceChanged.length) lines.push("");
}
