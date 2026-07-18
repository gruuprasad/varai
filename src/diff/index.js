import { validateAnalysisIR } from "../ir/validate.js";
import { diffBehaviors } from "./behaviors.js";
import { diffFacts } from "./facts.js";
import { summarizeDiff } from "./summary.js";

function withoutEvidence(value) {
  if (Array.isArray(value)) return value.map(withoutEvidence);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "evidence")
    .map(([key, item]) => [key, withoutEvidence(item)]));
}

function setDiff(before, after) {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  return {
    added: after.filter((item) => !old.has(item.id)),
    removed: before.filter((item) => !next.has(item.id)),
    changed: after.flatMap((item) => old.has(item.id) && JSON.stringify(withoutEvidence(old.get(item.id))) !== JSON.stringify(withoutEvidence(item))
      ? [{ before: old.get(item.id), after: item }]
      : []),
    evidenceChanged: after.flatMap((item) => old.has(item.id) &&
      JSON.stringify(withoutEvidence(old.get(item.id))) === JSON.stringify(withoutEvidence(item)) &&
      JSON.stringify(old.get(item.id)) !== JSON.stringify(item)
      ? [{ before: old.get(item.id), after: item }]
      : []),
  };
}

export function diffAnalyses(before, after) {
  validateAnalysisIR(before);
  validateAnalysisIR(after);
  if (before.schemaVersion !== after.schemaVersion) throw new Error("Cannot compare incompatible Analysis IR schema versions");
  const diff = {
    schemaVersion: before.schemaVersion,
    analyzerVersions: { from: before.analyzerVersion, to: after.analyzerVersion },
    warnings: before.analyzerVersion === after.analyzerVersion ? [] : ["Analyzer version changed; results may reflect analyzer evolution."],
    behaviors: diffBehaviors(before.behaviors, after.behaviors),
    states: setDiff(before.stateLocations, after.stateLocations),
    patterns: setDiff(before.patternInstances, after.patternInstances),
    facts: diffFacts(before.facts, after.facts),
    diagnostics: { from: before.diagnostics, to: after.diagnostics },
    intentArtifacts: setDiff(before.intentArtifacts, after.intentArtifacts),
  };
  diff.summary = summarizeDiff(diff);
  return diff;
}
