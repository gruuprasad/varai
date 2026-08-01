// Deterministic text rendering of a check report for the CLI. Verdict words
// come straight from the report and route through the plain-English glossary;
// no LLM manufactures prose.

import { verdictLabel, bindingStateLabel, reasonLabel } from "../reporters/display-language.js";
import { renderSurfacesSection } from "./surface-report.js";
import { lintIsActionable } from "./lint.js";

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
  if (report.provenance) {
    lines.push(`Build provenance ${report.provenance.state}${report.provenance.sessionId ? ` (${report.provenance.sessionId})` : ""}`);
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
      lines.push(`    how much I could analyze: ${item.coverage.map((record) => {
        const label = record.state === "analyzed" ? "analyzed"
          : `${record.state} (not health — reduced analyzability)`;
        return `${record.capability} ${label}`;
      }).join("; ")}`);
    }
    lines.push("");
  }

  for (const entry of report.context ?? []) {
    lines.push(`note (not checked)  ${entry.id}: ${entry.text}`);
  }
  if (report.context?.length) lines.push("");

  if (report.surfaces) {
    lines.push(renderSurfacesSection(report.surfaces, { model }).trimEnd());
    lines.push("");
  }

  if (report.scenarios) {
    lines.push("Scenarios (examples, not universal invariants)");
    for (const item of report.scenarios.results ?? []) {
      const label = item.result === "passed" ? "scenario passed"
        : item.result === "failed" ? "scenario failed"
          : "scenario could not run";
      lines.push(`${label}  ${item.id}`);
      if (item.reasons?.length) lines.push(`    why: ${item.reasons.join("; ")}`);
    }
    const s = report.scenarios.summary;
    if (s) {
      lines.push(`${s.total} scenarios: ${s.passed} passed, ${s.failed} failed, ${s.couldNotRun} could not run`);
    }
    lines.push("");
  }

  if (report.stateModels?.length) {
    lines.push("State models (declared transitions)");
    for (const section of report.stateModels) {
      lines.push(`  ${section.resourceId} (starts ${section.initial})`);
      for (const transition of section.transitions) {
        const label = transition.verdict === "holds" ? "transition holds"
          : transition.verdict === "violated" ? "transition VIOLATED"
            : "transition cannot verify";
        lines.push(`    ${label}  ${transition.from} -> ${transition.to} via ${transition.via.join(", ")}`);
        if (transition.reasons?.length) lines.push(`      why: ${transition.reasons.join("; ")}`);
        if (transition.evidence?.length) {
          lines.push(`      evidence: ${transition.evidence.map(formatEvidence).join("; ")}`);
        }
      }
    }
    lines.push("");
  }
  if (report.fieldContracts?.length) {
    lines.push("Field contracts (declared shapes)");
    for (const section of report.fieldContracts) {
      for (const field of section.fields) {
        const label = field.verdict === "holds" ? "field holds"
          : field.verdict === "violated" ? `field VIOLATED (${field.reasons.join("; ")})`
            : "field cannot verify";
        lines.push(`  ${label}  ${section.resourceId}.${field.name} (${field.declared.type}${field.declared.required ? "" : ", optional"})`);
      }
    }
    lines.push("");
  }
  if (report.flows?.length) {
    lines.push("Flows");
    for (const flow of report.flows) {
      const parts = flow.memberReadiness.map((item) =>
        `${item.member}: ${item.holds}/${item.commitments} hold${item.violated ? `, ${item.violated} violated` : ""}${item.cannotVerify ? `, ${item.cannotVerify} unverified` : ""}`);
      lines.push(`  ${flow.id} (${flow.name}) — entry ${flow.entry}; ${parts.join("; ")}`);
    }
    lines.push("");
  }


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

// Deterministic text rendering of a realization lint result. Candidates are
// ranked suggestions for the builder's next selector; they never change a
// verdict and lint never picks one.
export function renderLintText(lint, { model } = {}) {
  const lines = [];
  const elementNames = new Map((model?.elements ?? []).map((element) => [element.id, element.name]));
  lines.push(`Realization lint — spec ${lint.seedHash.slice(0, 16)}… (${lint.seedMatches ? "matches" : "OUT OF DATE"})`);
  for (const problem of lint.problems) {
    lines.push(`  [${problem.code}] ${problem.message}`);
  }
  const renderRecord = (record) => {
    lines.push(`  ${record.state}  ${record.id}`);
    if (record.elementIds?.length) {
      lines.push(`    matches: ${record.elementIds.map((id) => elementNames.get(id) ?? id).join(", ")}`);
    }
    if (record.candidates?.length) {
      lines.push(`    candidates (ranked, never chosen):`);
      for (const candidate of record.candidates) {
        const label = candidate.score == null
          ? elementNames.get(candidate.elementId) ?? candidate.key
          : `${candidate.score} ${elementNames.get(candidate.elementId) ?? candidate.key} [${candidate.kind}]`;
        lines.push(`      ${label}`);
      }
    }
  };
  if (lint.bindings.length) {
    lines.push(`Concept bindings (${lint.summary.bindings.resolved} resolved, ${lint.summary.bindings.ambiguous} ambiguous, ${lint.summary.bindings.notFound} not found, ${lint.summary.bindings.stale} stale):`);
    for (const record of lint.bindings) renderRecord(record);
  }
  if (lint.surfaceBindings.length) {
    lines.push(`Surface bindings (${lint.summary.surfaceBindings.resolved} resolved, ${lint.summary.surfaceBindings.ambiguous} ambiguous, ${lint.summary.surfaceBindings.notFound} not found, ${lint.summary.surfaceBindings.stale} stale):`);
    for (const record of lint.surfaceBindings) renderRecord(record);
  }
  if (lintIsActionable(lint)) lines.push("Actionable: every binding resolves; the witness is ready for check.");
  else lines.push("Actionable: no — fix the problems above, then lint again.");
  return `${lines.join("\n")}\n`;
}

