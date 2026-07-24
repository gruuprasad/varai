import { normalizePath } from "../../system-model/identity.js";

// Resolve raw Python import edges to Element→Element `depends_on` claims (D-e/D-f).
//
// Pure: takes raw `importEdges` (from collectPythonImports) and the lifted
// `elements` (each carrying a resolved `id`), returns `{ claims, diagnostics }`.
//
// Attribution succeeds only when BOTH endpoints resolve to owning Element
// symbols (D-e). Matching the enclosing AST name is necessary but not
// sufficient — nested helpers / non-Element symbols become
// depends-on-unresolved coverage gaps, never file-grain or guessed edges.
export function resolveDependencyEdges({ importEdges = [], elements = [] }) {
  const diagnostics = [];
  const ownerBySymbol = buildOwnerIndex(elements, diagnostics);

  const claimsByPair = new Map();
  const unresolvedEvidence = [];

  for (const edge of importEdges) {
    const sourceId = edge.fromSymbol == null
      ? undefined
      : ownerBySymbol.get(symbolKey(edge.fromFile, edge.fromSymbol));
    const targetId = ownerBySymbol.get(symbolKey(edge.toFile, edge.toSymbol));

    if (!sourceId || !targetId) {
      if (edge.evidence) unresolvedEvidence.push(edge.evidence);
      continue;
    }
    if (sourceId === targetId) continue; // self-edge (decision 6)

    const pair = `${sourceId}\0${targetId}`;
    const existing = claimsByPair.get(pair);
    if (existing) {
      if (edge.evidence) existing.evidence.push(edge.evidence);
      continue;
    }
    claimsByPair.set(pair, {
      sourceId,
      relation: "depends_on",
      target: { kind: "reference", id: targetId },
      slot: `depends_on:${targetId}`,
      evidence: edge.evidence ? [edge.evidence] : [],
      capability: "arch.dependency",
      observationMethod: "ast",
      claimState: "observed",
    });
  }

  if (unresolvedEvidence.length) {
    diagnostics.push({
      code: "depends-on-unresolved",
      severity: "warning",
      message: "An import could not be resolved to owning Elements on both endpoints",
      capability: "arch.dependency",
      claimState: "unverified",
      evidence: unresolvedEvidence,
    });
  }

  const claims = [...claimsByPair.values()]
    .sort((a, b) => (a.sourceId + a.slot).localeCompare(b.sourceId + b.slot));
  return { claims, diagnostics };
}

// arch.dependency coverage is honest only for subsystems whose Elements carry
// .py evidence — import extraction is Python-only (collectPythonImports).
export function pythonScopedSubsystemKeys(elements) {
  const keys = new Set();
  for (const element of elements) {
    if (typeof element?.subsystemKey !== "string" || !element.subsystemKey) continue;
    const entries = [...(element.evidence ?? []), ...(element.implementationPath ?? [])];
    if (entries.some((entry) => isPythonFile(entry?.file))) keys.add(element.subsystemKey);
  }
  return keys;
}

function isPythonFile(file) {
  return typeof file === "string" && file.toLowerCase().endsWith(".py");
}

function symbolKey(file, symbol) {
  return `${normalizePath(file)}\0${symbol}`;
}

function buildOwnerIndex(elements, diagnostics) {
  const ownerBySymbol = new Map();
  const collided = new Set();
  for (const element of elements) {
    const entries = [...(element.evidence ?? []), ...(element.implementationPath ?? [])];
    for (const entry of entries) {
      if (!entry || !entry.symbol || !entry.file) continue;
      const key = symbolKey(entry.file, entry.symbol);
      const current = ownerBySymbol.get(key);
      if (current === undefined) {
        ownerBySymbol.set(key, element.id);
      } else if (current !== element.id) {
        // Keep the lexicographically smallest id for determinism (decision 3).
        ownerBySymbol.set(key, current < element.id ? current : element.id);
        if (!collided.has(key)) {
          collided.add(key);
          diagnostics.push({
            code: "depends-on-symbol-collision",
            severity: "warning",
            message: `Symbol ${key.replace("\0", "::")} is claimed by multiple Elements`,
            capability: "arch.dependency",
            claimState: "unverified",
            evidence: [{ file: entry.file, ...(entry.line == null ? {} : { line: entry.line }), symbol: entry.symbol }],
          });
        }
      }
    }
  }
  return ownerBySymbol;
}
