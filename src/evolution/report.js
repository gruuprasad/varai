import {
  classifyCoverageTransition,
  coverageMatchKey,
} from "../build-session/evaluate.js";
import { COVERAGE_TRANSITIONS } from "../build-session/state.js";

function byCoverageKey(records = []) {
  const map = new Map();
  for (const record of records) {
    if (!record?.capability || !record?.scopeId) continue;
    map.set(coverageMatchKey(record), record);
  }
  return map;
}

/** Classify per-requirement coverage using capability + scopeId identity. */
export function classifyRequirementCoverage(beforeRecords = [], afterRecords = []) {
  const before = byCoverageKey(beforeRecords);
  const after = byCoverageKey(afterRecords);
  let keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  if (!keys.length) {
    // Older report shapes may omit scopeId; fall back to capability-only identity.
    for (const record of beforeRecords) {
      if (record?.capability) before.set(record.capability, { ...record, scopeId: record.scopeId ?? record.capability });
    }
    for (const record of afterRecords) {
      if (record?.capability) after.set(record.capability, { ...record, scopeId: record.scopeId ?? record.capability });
    }
    keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  }
  if (!keys.length) return COVERAGE_TRANSITIONS.UNCHANGED;
  const transitions = keys.map((key) => classifyCoverageTransition(before.get(key) ?? null, after.get(key) ?? null));
  if (transitions.includes(COVERAGE_TRANSITIONS.DEGRADED)) return COVERAGE_TRANSITIONS.DEGRADED;
  if (transitions.includes(COVERAGE_TRANSITIONS.IMPROVED)) return COVERAGE_TRANSITIONS.IMPROVED;
  if (transitions.includes(COVERAGE_TRANSITIONS.ANALYZER_VERSION_CHANGED)) {
    return COVERAGE_TRANSITIONS.ANALYZER_VERSION_CHANGED;
  }
  return COVERAGE_TRANSITIONS.UNCHANGED;
}

export function classifyVerdictKind(from, to) {
  if (from === to) return "unchanged";
  if (from === "holds" && to === "cannot_verify") return "holds_to_cannot_verify";
  if (from === "holds" && to === "violated") return "holds_to_violated";
  return "changed";
}

export function isRequirementRegression(verdictKind) {
  return verdictKind === "holds_to_cannot_verify" || verdictKind === "holds_to_violated";
}
