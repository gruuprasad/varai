import { SYSTEM_MODEL_ANALYZER_VERSION, SYSTEM_MODEL_SCHEMA_VERSION } from "./version.js";
import { claimId, coverageId, elementId, normalizeEvidencePath, subsystemId, systemId } from "./identity.js";
import { leastConfident, mergeCoverageState, mergeDetails, mergeEvidence } from "./merge.js";

function compareJson(a, b) {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

export function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeValue(value[key])]));
}

export function canonicalStringifySystemModel(value) {
  return JSON.stringify(canonicalizeValue(value), null, 2) + "\n";
}

export const canonicalStringify = canonicalStringifySystemModel;

function normalizeEvidence(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return mergeEvidence(list.map((evidence) => canonicalizeValue({
    file: normalizeEvidencePath(evidence.file),
    ...(evidence.line == null ? {} : { line: evidence.line }),
    ...(evidence.symbol == null ? {} : { symbol: evidence.symbol }),
    ...(evidence.manifestKey == null ? {} : { manifestKey: evidence.manifestKey }),
  })));
}

function normalizeImplementationPath(values) {
  const result = [];
  let previous = null;
  for (const evidence of Array.isArray(values) ? values : []) {
    const normalized = canonicalizeValue({
      file: normalizeEvidencePath(evidence.file),
      ...(evidence.line == null ? {} : { line: evidence.line }),
      ...(evidence.symbol == null ? {} : { symbol: evidence.symbol }),
      ...(evidence.manifestKey == null ? {} : { manifestKey: evidence.manifestKey }),
    });
    const key = JSON.stringify(normalized);
    if (key === previous) continue;
    previous = key;
    result.push(normalized);
  }
  return result;
}

function mergeImplementationPath(a, b) {
  const left = normalizeImplementationPath(a);
  const right = normalizeImplementationPath(b);
  if (!left.length) return right;
  if (!right.length) return left;
  if (left.length !== right.length) return left.length < right.length ? left : right;
  return JSON.stringify(left) <= JSON.stringify(right) ? left : right;
}

function normalizeQualifiers(qualifiers = {}) {
  return canonicalizeValue(Object.fromEntries(Object.entries(qualifiers).map(([key, value]) => [
    key,
    Array.isArray(value) ? [...new Set(value)].sort(compareJson) : value,
  ])));
}

function mergeById(items, merge, diagnostics, kind) {
  const result = new Map();
  for (const item of items) {
    const current = result.get(item.id);
    if (!current) result.set(item.id, item);
    else result.set(item.id, merge(current, item, diagnostics, kind));
  }
  return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function collision(diagnostics, kind, id, evidence) {
  diagnostics.push({
    code: "semantic-identity-collision",
    severity: "warning",
    message: `${kind} identity ${id} resolved to incompatible objects`,
    analyzerId: "system-model.canonicalizer",
    capability: "model.identity",
    scopeId: id,
    evidence: normalizeEvidence(evidence),
  });
}

function mergeElement(a, b, diagnostics) {
  if (a.subsystemId !== b.subsystemId || a.kind !== b.kind || a.key !== b.key || a.name !== b.name) {
    collision(diagnostics, "Element", a.id, [...a.evidence, ...b.evidence]);
  }
  return canonicalizeValue({
    ...a,
    roles: [...new Set([...a.roles, ...b.roles])].sort(),
    evidence: mergeEvidence(a.evidence, b.evidence),
    implementationPath: mergeImplementationPath(a.implementationPath, b.implementationPath),
    claimState: leastConfident(a.claimState, b.claimState),
  });
}

function mergeClaim(a, b, diagnostics) {
  if (a.sourceId !== b.sourceId || a.relation !== b.relation || JSON.stringify(a.target) !== JSON.stringify(b.target)) {
    collision(diagnostics, "Claim", a.id, [...a.evidence, ...b.evidence]);
  }
  return canonicalizeValue({
    ...a,
    evidence: mergeEvidence(a.evidence, b.evidence),
    implementationPath: mergeImplementationPath(a.implementationPath, b.implementationPath),
    claimState: leastConfident(a.claimState, b.claimState),
  });
}

function mergeCoverage(a, b) {
  return canonicalizeValue({
    ...a,
    state: mergeCoverageState([a.state, b.state]),
    evidence: mergeEvidence(a.evidence, b.evidence),
    details: mergeDetails(a.details, b.details),
  });
}

export function createSystemModel({
  systemName,
  systemKey = "repository-root",
  analyzerVersion = SYSTEM_MODEL_ANALYZER_VERSION,
  subsystems = [],
  elements = [],
  claims = [],
  coverage = [],
  diagnostics = [],
}) {
  const rootId = systemId(systemKey);
  const normalizedSubsystems = subsystems.map((subsystem) => canonicalizeValue({
    ...subsystem,
    id: subsystemId(rootId, subsystem),
    qualifiers: normalizeQualifiers(subsystem.qualifiers),
    evidence: normalizeEvidence(subsystem.evidence),
  }));
  const subsystemByKey = new Map(normalizedSubsystems.map((item) => [item.key, item]));

  const pendingDiagnostics = [...diagnostics];
  const normalizedElements = elements.map((element) => {
    const parent = element.subsystemId ?? subsystemByKey.get(element.subsystemKey)?.id;
    const normalized = {
      ...element,
      subsystemId: parent,
      roles: [...new Set(element.roles ?? [])].sort(),
      qualifiers: normalizeQualifiers(element.qualifiers),
      evidence: normalizeEvidence(element.evidence),
      implementationPath: normalizeImplementationPath(element.implementationPath),
      observationMethod: element.observationMethod ?? "semantic",
      claimState: element.claimState ?? "observed",
    };
    delete normalized.subsystemKey;
    normalized.id = elementId(normalized);
    return canonicalizeValue(normalized);
  });
  const mergedElements = mergeById(normalizedElements, mergeElement, pendingDiagnostics, "Element");
  const elementByKey = new Map(mergedElements.map((item) => [`${item.subsystemId}:${item.kind}:${item.key}`, item]));

  const resolveId = (value) => {
    if (!value || typeof value !== "object") return value;
    if (value.id) return value.id;
    if (value.kind === "system") return rootId;
    if (value.kind === "subsystem") return subsystemByKey.get(value.key)?.id;
    if (value.kind === "element") {
      const parent = value.subsystemId ?? subsystemByKey.get(value.subsystemKey)?.id;
      return elementByKey.get(`${parent}:${value.elementKind}:${value.key}`)?.id;
    }
    return undefined;
  };

  const normalizedClaims = claims.map((claim) => {
    const sourceId = typeof claim.sourceId === "string" ? claim.sourceId : resolveId(claim.source);
    let target = claim.target;
    if (target?.kind === "reference" && !target.id) {
      target = { kind: "reference", id: resolveId(target.reference) };
    }
    const normalized = {
      ...claim,
      sourceId,
      target: canonicalizeValue(target),
      slot: claim.slot ?? null,
      qualifiers: normalizeQualifiers(claim.qualifiers),
      evidence: normalizeEvidence(claim.evidence),
      implementationPath: normalizeImplementationPath(claim.implementationPath),
      observationMethod: claim.observationMethod ?? "semantic",
      claimState: claim.claimState ?? "observed",
    };
    delete normalized.source;
    normalized.id = claimId(normalized);
    return canonicalizeValue(normalized);
  });
  const mergedClaims = mergeById(normalizedClaims, mergeClaim, pendingDiagnostics, "Claim");

  const normalizedCoverage = coverage.map((item) => {
    const normalized = {
      ...item,
      scopeId: typeof item.scopeId === "string" ? item.scopeId : resolveId(item.scope),
      evidence: normalizeEvidence(item.evidence),
      details: mergeDetails(item.details),
    };
    delete normalized.scope;
    normalized.id = coverageId(normalized);
    return canonicalizeValue(normalized);
  });
  const mergedCoverage = mergeById(normalizedCoverage, mergeCoverage, pendingDiagnostics, "Coverage");

  const normalizedDiagnostics = pendingDiagnostics.map((item) => canonicalizeValue({
    ...item,
    evidence: normalizeEvidence(item.evidence),
  })).sort(compareJson);

  return canonicalizeValue({
    schemaVersion: SYSTEM_MODEL_SCHEMA_VERSION,
    analyzerVersion,
    system: { id: rootId, key: systemKey, name: systemName },
    subsystems: normalizedSubsystems.sort((a, b) => a.id.localeCompare(b.id)),
    elements: mergedElements,
    claims: mergedClaims,
    coverage: mergedCoverage,
    diagnostics: normalizedDiagnostics,
  });
}
