// Deterministic text rendering of a check report for the CLI. Verdict words
// come straight from the report and route through the plain-English glossary;
// no LLM manufactures prose.

import { verdictLabel, bindingStateLabel, reasonLabel } from "../reporters/display-language.js";

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
  lines.push(`Check — ${systemName}`);
  lines.push(`Spec ${report.seedHash} (${report.ratified ? "approved" : "draft"})`);
  if (report.realization.present) {
    const state = report.realization.stale ? "out of date — made for a different spec" : "current";
    lines.push(`Builder's map ${report.realization.seedHash} (${state})`);
  } else {
    lines.push("Builder's map — none supplied; nothing can be located in the code");
  }
  lines.push("");

  for (const item of report.commitments) {
    lines.push(`${verdictLabel(item.verdict)}  ${item.id}`);
    lines.push(`    ${item.source} ${item.relation} ${formatTarget(item.target)}`);
    lines.push(`    where it lives: ${bindingStateLabel(item.bindingState)}`);
    for (const binding of item.bindings ?? []) {
      const names = (binding.elementIds ?? []).map((id) => elementNames.get(id) ?? id).join(", ");
      const suffix = binding.state === "resolved" ? ` -> ${names}`
        : binding.reason ? ` (${reasonLabel(binding.reason)})` : "";
      lines.push(`      ${binding.id} [${binding.concept}] ${bindingStateLabel(binding.state)}${suffix}`);
    }
    if (item.reasons.length) lines.push(`    why: ${item.reasons.map(reasonLabel).join("; ")}`);
    if (item.claimIds.length) lines.push(`    evidence ids: ${item.claimIds.join(", ")}`);
    if (item.evidence.length) lines.push(`    evidence: ${item.evidence.map(formatEvidence).join("; ")}`);
    if (item.implementationPath.length) {
      lines.push(`    path through the code: ${item.implementationPath.map(formatEvidence).join("; ")}`);
    }
    if (item.coverage.length) {
      lines.push(`    how much I could analyze: ${item.coverage.map((record) => `${record.capability} ${record.state}`).join("; ")}`);
    }
    lines.push("");
  }

  for (const entry of report.context ?? []) {
    lines.push(`note (not checked)  ${entry.id}: ${entry.text}`);
  }
  if (report.context?.length) lines.push("");

  const { summary } = report;
  lines.push([
    `${summary.total} requirements:`,
    `${summary.holds} confirmed,`,
    `${summary.violated} missing,`,
    `${summary.cannotVerify} couldn't tell,`,
    `${summary.notCheckable} noted`,
    `(located: ${summary.binding.resolved} found, ${summary.binding.unbound} no location,`,
    `${summary.binding.ambiguous} matched several, ${summary.binding.stale} out of date)`,
  ].join(" "));
  return `${lines.join("\n")}\n`;
}
