const RELATIONS = Object.freeze({
  contains: "contains", exposes: "exposes", offers: "offers", triggered_by: "is triggered by",
  invokes: "invokes", accepts: "accepts", produces: "produces", requires: "requires",
  available_when: "is available when", reads: "reads", changes: "changes", creates: "creates",
  removes: "removes", succeeds_with: "succeeds with", fails_with: "fails with",
  navigates_to: "navigates to", emits: "emits", has_field: "has field",
  relates_to: "relates to", stored_in: "is stored in",
});

function evidence(value) {
  return (value?.evidence ?? []).map((item) => `${item.file}${item.line ? `:${item.line}` : ""}`).join(", ") || "no evidence";
}

function target(claim, labels) {
  return claim.target.kind === "reference" ? (labels[claim.target.id] ?? claim.target.id) : String(claim.target.value);
}

function qualifiers(value) {
  const entries = Object.entries(value ?? {});
  return entries.length ? ` (${entries.map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(", ") : item}`).join("; ")})` : "";
}

function claimText(claim, labels) {
  return `${labels[claim.sourceId] ?? claim.sourceId} ${RELATIONS[claim.relation] ?? claim.relation} ${target(claim, labels)}${qualifiers(claim.qualifiers)}`;
}

export function renderSemanticDiff(diff, options = {}) {
  const lines = ["# Semantic progression", "", `From: ${options.from ?? "before"}`, `To: ${options.to ?? "after"}`, ""];
  for (const warning of diff.warnings) lines.push(`> Warning: ${warning}`, "");

  lines.push("## Summary", "",
    `- Elements: +${diff.summary.elementsAdded} -${diff.summary.elementsRemoved} ~${diff.summary.elementsChanged}`,
    `- Claims: +${diff.summary.claimsAdded} -${diff.summary.claimsRemoved} ~${diff.summary.claimsChanged}`,
    `- Coverage changes: ${diff.summary.coverageChanges}`,
    "");

  if (!diff.summary.hasChanges) lines.push("No semantic changes within declared analyzer coverage.", "");

  if (diff.elements.added.length || diff.elements.removed.length || diff.elements.changed.length) {
    lines.push("## Elements", "");
    for (const item of diff.elements.added) lines.push(`- + ${item.name} (${item.kind}) — ${evidence(item)}`);
    for (const item of diff.elements.removed) lines.push(`- - ${item.name} (${item.kind}) — ${evidence(item)}`);
    for (const item of diff.elements.changed) lines.push(`- ~ ${item.before.name} → ${item.after.name} — ${evidence(item.after)}`);
    lines.push("");
  }

  if (diff.claims.added.length || diff.claims.removed.length || diff.claims.changed.length) {
    lines.push("## Behavior and relationship changes", "");
    for (const item of diff.claims.added) lines.push(`- + ${claimText(item, diff.labels)} — ${evidence(item)}`);
    for (const item of diff.claims.removed) lines.push(`- - ${claimText(item, diff.labels)} — ${evidence(item)}`);
    for (const item of diff.claims.changed) {
      lines.push(`- ~ ${claimText(item.before, diff.labels)} → ${claimText(item.after, diff.labels)} — ${evidence(item.after)}`);
    }
    lines.push("");
  }

  if (diff.coverage.added.length || diff.coverage.removed.length || diff.coverage.changed.length) {
    lines.push("## Analyzer coverage", "");
    for (const item of diff.coverage.added) lines.push(`- + ${item.capability}: ${item.state}`);
    for (const item of diff.coverage.removed) lines.push(`- - ${item.capability}: ${item.state}`);
    for (const item of diff.coverage.changed) lines.push(`- ~ ${item.after.capability}: ${item.before.state} → ${item.after.state}`);
    lines.push("");
  }

  if (options.showEvidenceMoves && diff.summary.hasEvidenceChanges) {
    lines.push("## Evidence movement", "");
    for (const key of ["elements", "claims", "coverage"]) {
      for (const item of diff[key].evidenceChanged) lines.push(`- ${key.slice(0, -1)} ${item.after.id}: ${evidence(item.before)} → ${evidence(item.after)}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
