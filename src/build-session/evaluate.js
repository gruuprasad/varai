import {
  COVERAGE_TRANSITIONS,
  GATE_STATES,
  isDegradedCoverageState,
} from "./state.js";

/** Coverage identity for regression matching: capability + scope, not analyzer version or evidence. */
export function coverageMatchKey(record) {
  return `${record.capability}\0${record.scopeId}`;
}

export function classifyCoverageTransition(before, after) {
  if (!before && !after) return COVERAGE_TRANSITIONS.UNCHANGED;
  if (before && !after) {
    return before.state === "analyzed" ? COVERAGE_TRANSITIONS.DEGRADED : COVERAGE_TRANSITIONS.UNCHANGED;
  }
  if (!before && after) return COVERAGE_TRANSITIONS.UNCHANGED;

  const versionChanged = before.analyzerVersion !== after.analyzerVersion;
  if (before.state === after.state) {
    if (versionChanged) return COVERAGE_TRANSITIONS.ANALYZER_VERSION_CHANGED;
    return COVERAGE_TRANSITIONS.UNCHANGED;
  }

  if (before.state === "analyzed" && isDegradedCoverageState(after.state)) {
    return COVERAGE_TRANSITIONS.DEGRADED;
  }
  if (before.state === "partial" && after.state === "analyzed") {
    return COVERAGE_TRANSITIONS.IMPROVED;
  }
  if (isDegradedCoverageState(before.state) && after.state === "analyzed") {
    return COVERAGE_TRANSITIONS.IMPROVED;
  }
  if (before.state === "analyzed" && after.state !== "analyzed") {
    return COVERAGE_TRANSITIONS.DEGRADED;
  }
  if (versionChanged) return COVERAGE_TRANSITIONS.ANALYZER_VERSION_CHANGED;
  return COVERAGE_TRANSITIONS.UNCHANGED;
}

function byCoverageKey(model) {
  const map = new Map();
  for (const record of model?.coverage ?? []) {
    map.set(coverageMatchKey(record), record);
  }
  return map;
}

export function compareCoverage(startModel, completionModel) {
  const before = byCoverageKey(startModel);
  const after = byCoverageKey(completionModel);
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  return keys.map((key) => {
    const from = before.get(key) ?? null;
    const to = after.get(key) ?? null;
    const transition = classifyCoverageTransition(from, to);
    return {
      key,
      capability: (to ?? from).capability,
      scopeId: (to ?? from).scopeId,
      from: from ? { state: from.state, analyzerVersion: from.analyzerVersion } : null,
      to: to ? { state: to.state, analyzerVersion: to.analyzerVersion } : null,
      transition,
    };
  });
}

function byId(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

const REQUIREMENT_REGRESSIONS = new Set([
  "holds->cannot_verify",
  "holds->violated",
]);

export function compareRequirementVerdicts(startReport, completionReport) {
  const before = byId(startReport?.commitments);
  const after = byId(completionReport?.commitments);
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const regressions = [];
  for (const id of ids) {
    const from = before.get(id)?.verdict ?? null;
    const to = after.get(id)?.verdict ?? null;
    if (from === to) continue;
    const kind = `${from}->${to}`;
    if (REQUIREMENT_REGRESSIONS.has(kind)) {
      regressions.push({ id, from, to, kind });
    }
  }
  return regressions;
}

export function evaluateBuildGate({
  startModel,
  completionModel,
  startReport,
  completionReport,
} = {}) {
  const coverage = compareCoverage(startModel, completionModel);
  const coverageRegressions = coverage
    .filter((item) => item.transition === COVERAGE_TRANSITIONS.DEGRADED)
    .map((item) => ({
      capability: item.capability,
      scopeId: item.scopeId,
      from: item.from?.state ?? null,
      to: item.to?.state ?? null,
      transition: item.transition,
    }));
  const requirementRegressions = compareRequirementVerdicts(startReport, completionReport);
  const reasons = [];

  for (const item of coverageRegressions) {
    reasons.push(`coverage-degraded:${item.capability}:${item.scopeId}`);
  }
  for (const item of coverage.filter((entry) => entry.transition === COVERAGE_TRANSITIONS.ANALYZER_VERSION_CHANGED)) {
    reasons.push(`analyzer-version-changed:${item.capability}:${item.scopeId}`);
  }
  for (const item of requirementRegressions) {
    reasons.push(`requirement-regression:${item.kind}:${item.id}`);
  }

  const blocksReady = coverageRegressions.length > 0 || requirementRegressions.length > 0;
  return {
    state: blocksReady ? GATE_STATES.NEEDS_ATTENTION : GATE_STATES.READY,
    reasons,
    coverageRegressions,
    requirementRegressions,
  };
}
