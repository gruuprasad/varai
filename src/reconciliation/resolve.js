// Resolution of builder-witness artifact selectors against canonical System
// Model Elements. Stable public selectors (lens/kind/key) win; source
// file/symbol evidence is only a fallback selector. Source lines never define
// semantic identity — they support reading, not binding.

function lensBySubsystemId(model) {
  return new Map((model.subsystems ?? []).map((subsystem) => [subsystem.id, subsystem.lens]));
}

function matchesSelector(element, artifact, lensOf) {
  if (artifact.kind && element.kind !== artifact.kind) return false;
  if (artifact.lens && lensOf.get(element.subsystemId) !== artifact.lens) return false;
  if (artifact.key !== undefined) {
    return element.key === artifact.key || element.name === artifact.key;
  }
  const source = artifact.source ?? {};
  return (element.evidence ?? []).some((item) =>
    item.file === source.file && (source.symbol === undefined || item.symbol === source.symbol));
}

function byId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

// resolveBindings returns a Map from binding id to its resolution record:
//   { id, concept, state, reason, elementIds }
// state is one of resolved | ambiguous | stale (unbound is a commitment-level
// state — it means no binding exists, so it never appears here).
export function resolveBindings(model, realization, currentSeedHash) {
  const lensOf = lensBySubsystemId(model);
  const hashMatches = realization.seedHash === currentSeedHash;
  const result = new Map();
  const bindings = [...(realization.bindings ?? [])].sort(byId);
  for (const binding of bindings) {
    if (!hashMatches) {
      result.set(binding.id, {
        id: binding.id, concept: binding.concept,
        state: "stale", reason: "seed-hash-mismatch", elementIds: [],
      });
      continue;
    }
    const artifact = binding.artifact ?? {};
    const elementIds = (model.elements ?? [])
      .filter((element) => matchesSelector(element, artifact, lensOf))
      .map((element) => element.id)
      .sort();
    if (elementIds.length === 0) {
      result.set(binding.id, {
        id: binding.id, concept: binding.concept,
        state: "stale", reason: "artifact-not-found", elementIds,
      });
    } else if (elementIds.length === 1) {
      result.set(binding.id, {
        id: binding.id, concept: binding.concept,
        state: "resolved", reason: null, elementIds,
      });
    } else {
      result.set(binding.id, {
        id: binding.id, concept: binding.concept,
        state: "ambiguous", reason: "selector-ambiguous", elementIds,
      });
    }
  }

  // Cross-binding soundness: a lying target/source binding is otherwise
  // indistinguishable from a truthful one, because the binding IS the concept →
  // element mapping. But when two DISTINCT concepts both resolve to the same
  // observed element, that element's identity is ambiguous — trusting it could
  // let one concept borrow another's canonical Claim and fake a verdict. Such
  // bindings are downgraded to ambiguous so the commitment reports cannot_verify
  // rather than a possibly-false holds. (One concept with several bindings to
  // the same element is fine: the concept set stays size 1.)
  const conceptsByElement = new Map();
  for (const record of result.values()) {
    if (record.state !== "resolved") continue;
    for (const elementId of record.elementIds) {
      const concepts = conceptsByElement.get(elementId) ?? new Set();
      concepts.add(record.concept);
      conceptsByElement.set(elementId, concepts);
    }
  }
  const collided = new Set(
    [...conceptsByElement].filter(([, concepts]) => concepts.size > 1).map(([elementId]) => elementId));
  if (collided.size) {
    for (const record of result.values()) {
      if (record.state === "resolved" && record.elementIds.some((id) => collided.has(id))) {
        record.state = "ambiguous";
        record.reason = "concept-collision";
      }
    }
  }
  return result;
}
