// Deterministic text rendering of a reconciliation report for the CLI.
// Verdict words come straight from the report; no LLM manufactures prose.

const VERDICT_LABELS = {
  holds: "holds",
  violated: "VIOLATED",
  cannot_verify: "cannot verify",
  not_checkable: "not checkable",
};

function formatTarget(target) {
  if (target?.concept !== undefined) return target.concept;
  return JSON.stringify(target?.literal);
}

function formatEvidence(entry) {
  const location = `${entry.file}${entry.line == null ? "" : `:${entry.line}`}`;
  return entry.symbol ? `${location} (${entry.symbol})` : location;
}

export function renderCheckText(report, { model } = {}) {
  const lines = [];
  const elementNames = new Map((model?.elements ?? []).map((element) => [element.id, element.name]));
  const systemName = report.system?.name ?? "system";
  lines.push(`Reconciliation — ${systemName}`);
  lines.push(`Seed ${report.seedHash} (${report.ratified ? "ratified" : "draft"})`);
  if (report.realization.present) {
    const state = report.realization.stale ? "stale — built against a different seed" : "current";
    lines.push(`Realization ${report.realization.seedHash} (${state})`);
  } else {
    lines.push("Realization none — builder witness is missing; every commitment is unbound");
  }
  lines.push("");

  for (const item of report.commitments) {
    const label = VERDICT_LABELS[item.verdict] ?? item.verdict;
    lines.push(`${label}  ${item.id}`);
    lines.push(`    ${item.source} ${item.relation} ${formatTarget(item.target)}`);
    lines.push(`    binding: ${item.bindingState}`);
    for (const binding of item.bindings ?? []) {
      const names = (binding.elementIds ?? []).map((id) => elementNames.get(id) ?? id).join(", ");
      const suffix = binding.state === "resolved" ? ` -> ${names}` : binding.reason ? ` (${binding.reason})` : "";
      lines.push(`      ${binding.id} [${binding.concept}] ${binding.state}${suffix}`);
    }
    if (item.reasons.length) lines.push(`    reasons: ${item.reasons.join(", ")}`);
    if (item.claimIds.length) lines.push(`    claims: ${item.claimIds.join(", ")}`);
    if (item.evidence.length) lines.push(`    evidence: ${item.evidence.map(formatEvidence).join("; ")}`);
    if (item.implementationPath.length) {
      lines.push(`    implementation path: ${item.implementationPath.map(formatEvidence).join("; ")}`);
    }
    if (item.coverage.length) {
      lines.push(`    coverage: ${item.coverage.map((record) => `${record.capability} ${record.state}`).join("; ")}`);
    }
    lines.push("");
  }

  for (const entry of report.context ?? []) {
    lines.push(`human context  ${entry.id}: ${entry.text}`);
  }
  if (report.context?.length) lines.push("");

  const { summary } = report;
  lines.push([
    `${summary.total} commitments:`,
    `${summary.holds} holds,`,
    `${summary.violated} violated,`,
    `${summary.cannotVerify} cannot verify,`,
    `${summary.notCheckable} not checkable`,
    `(bindings: ${summary.binding.resolved} resolved, ${summary.binding.unbound} unbound,`,
    `${summary.binding.ambiguous} ambiguous, ${summary.binding.stale} stale)`,
  ].join(" "));
  return `${lines.join("\n")}\n`;
}
