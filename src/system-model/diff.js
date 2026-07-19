import { validateSystemModel } from "./validate.js";

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function withoutEvidence(value) {
  if (Array.isArray(value)) return value.map(withoutEvidence);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "evidence" && key !== "implementationPath")
    .map(([key, item]) => [key, withoutEvidence(item)]));
}

function collectionDiff(before, after) {
  const old = byId(before);
  const next = byId(after);
  const added = after.filter((item) => !old.has(item.id));
  const removed = before.filter((item) => !next.has(item.id));
  const changed = [];
  const evidenceChanged = [];

  for (const item of after) {
    const previous = old.get(item.id);
    if (!previous) continue;
    const oldSemantic = JSON.stringify(withoutEvidence(previous));
    const newSemantic = JSON.stringify(withoutEvidence(item));
    if (oldSemantic !== newSemantic) changed.push({ before: previous, after: item });
    else if (JSON.stringify(previous.evidence ?? []) !== JSON.stringify(item.evidence ?? []) ||
             JSON.stringify(previous.implementationPath ?? []) !== JSON.stringify(item.implementationPath ?? [])) {
      evidenceChanged.push({ before: previous, after: item });
    }
  }
  return { added, removed, changed, evidenceChanged };
}

function labelsFor(...models) {
  const labels = {};
  for (const model of models) {
    labels[model.system.id] = model.system.name;
    for (const item of [...model.subsystems, ...model.elements]) labels[item.id] = item.name;
  }
  return labels;
}

export function diffSystemModels(before, after) {
  validateSystemModel(before);
  validateSystemModel(after);
  if (before.schemaVersion !== after.schemaVersion) throw new Error("Cannot compare incompatible System Model schema versions");

  const diff = {
    schemaVersion: before.schemaVersion,
    analyzerVersions: { from: before.analyzerVersion, to: after.analyzerVersion },
    warnings: before.analyzerVersion === after.analyzerVersion ? [] : ["Analyzer version changed; findings may reflect analyzer evolution."],
    labels: labelsFor(before, after),
    system: JSON.stringify(withoutEvidence(before.system)) === JSON.stringify(withoutEvidence(after.system)) ? null : { before: before.system, after: after.system },
    subsystems: collectionDiff(before.subsystems, after.subsystems),
    elements: collectionDiff(before.elements, after.elements),
    claims: collectionDiff(before.claims, after.claims),
    coverage: collectionDiff(before.coverage, after.coverage),
    diagnostics: { from: before.diagnostics, to: after.diagnostics },
  };

  const semanticChanges = ["subsystems", "elements", "claims", "coverage"]
    .reduce((total, key) => total + diff[key].added.length + diff[key].removed.length + diff[key].changed.length, diff.system ? 1 : 0);
  const evidenceChanges = ["subsystems", "elements", "claims", "coverage"]
    .reduce((total, key) => total + diff[key].evidenceChanged.length, 0);
  diff.summary = {
    hasChanges: semanticChanges > 0,
    hasEvidenceChanges: evidenceChanges > 0,
    semanticChanges,
    evidenceChanges,
    elementsAdded: diff.elements.added.length,
    elementsRemoved: diff.elements.removed.length,
    elementsChanged: diff.elements.changed.length,
    claimsAdded: diff.claims.added.length,
    claimsRemoved: diff.claims.removed.length,
    claimsChanged: diff.claims.changed.length,
    coverageChanges: diff.coverage.added.length + diff.coverage.removed.length + diff.coverage.changed.length,
  };
  return diff;
}
