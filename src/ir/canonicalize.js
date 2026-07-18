import { ANALYSIS_SCHEMA_VERSION, ANALYZER_VERSION } from "./version.js";
import { behaviorIdentity, clauseIdentity, factIdentity, stableId, stateIdentity } from "./identity.js";

function compareJson(a, b) {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

export function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeValue(value[key])]));
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalizeValue(value), null, 2) + "\n";
}

function evidenceList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const unique = new Map();
  for (const ev of list) {
    if (!ev?.file) continue;
    const normalized = { file: String(ev.file).replaceAll("\\", "/"), ...(ev.line == null ? {} : { line: ev.line }) };
    unique.set(`${normalized.file}:${normalized.line ?? 0}`, normalized);
  }
  return [...unique.values()].sort(compareJson);
}

function claimState(layer, explicit) {
  if (explicit) return explicit;
  return layer === "heuristic" ? "inferred" : "observed";
}

function normalizeClause(kind, clause) {
  const evidence = evidenceList(clause.evidence);
  const normalized = {
    ...clause,
    id: stableId("clause", clauseIdentity(kind, clause)),
    evidence,
    observationMethod: clause.observationMethod ?? clause.layer ?? "semantic",
    claimState: claimState(clause.layer, clause.claimState),
  };
  delete normalized.layer;
  return canonicalizeValue(normalized);
}

function normalizeClauses(kind, clauses) {
  const merged = new Map();
  for (const clause of clauses) {
    const normalized = normalizeClause(kind, clause);
    const current = merged.get(normalized.id);
    if (!current) {
      merged.set(normalized.id, normalized);
      continue;
    }
    current.evidence = evidenceList([...current.evidence, ...normalized.evidence]);
    // Keep the least-confident state when observations disagree.
    const rank = { observed: 0, inferred: 1, unverified: 2, ambiguous: 3 };
    if (rank[normalized.claimState] > rank[current.claimState]) current.claimState = normalized.claimState;
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeBehavior(behavior) {
  const normalized = {
    ...behavior,
    id: stableId("behavior", behaviorIdentity(behavior)),
    door: { ...behavior.door, evidence: evidenceList(behavior.door?.evidence) },
  };
  for (const kind of ["requires", "takes", "gives", "reads", "writes", "fails", "untraced"]) {
    normalized[kind] = normalizeClauses(kind, behavior[kind] ?? []);
  }
  return canonicalizeValue(normalized);
}

export function createAnalysisIR({ scanContext, facts, patternInstances = [], behaviors = [], bundleViews = [], diagnostics = [], intentArtifacts = [] }) {
  const normalizedFacts = facts.map((fact) => {
    const normalized = {
      ...fact,
      id: stableId("fact", factIdentity(fact)),
      evidence: evidenceList(fact.evidence),
      observationMethod: fact.observationMethod ?? fact.layer ?? "ast",
      claimState: claimState(fact.layer, fact.claimState),
    };
    delete normalized.layer;
    return canonicalizeValue(normalized);
  }).sort((a, b) => a.id.localeCompare(b.id));

  const normalizedBehaviors = behaviors.map(normalizeBehavior).sort((a, b) => a.id.localeCompare(b.id));
  const stateMap = new Map();
  for (const behavior of normalizedBehaviors) {
    for (const access of [...behavior.reads, ...behavior.writes]) {
      const identity = stateIdentity(access);
      const id = stableId("state", identity);
      const state = stateMap.get(id) ?? { id, medium: identity[0], target: identity[1], evidence: [] };
      state.evidence.push(...access.evidence);
      state.evidence = evidenceList(state.evidence);
      stateMap.set(id, state);
    }
  }

  return canonicalizeValue({
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    analyzerVersion: ANALYZER_VERSION,
    scanContext: canonicalizeValue(scanContext),
    facts: normalizedFacts,
    patternInstances: [...patternInstances].sort((a, b) => a.id.localeCompare(b.id)),
    behaviors: normalizedBehaviors,
    stateLocations: [...stateMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    bundleViews: [...bundleViews].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    diagnostics: [...diagnostics].sort(compareJson),
    intentArtifacts: [...intentArtifacts].sort(compareJson),
  });
}
