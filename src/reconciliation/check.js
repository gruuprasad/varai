import { seedContentHash } from "../seed/identity.js";
import { RELATION_CAPABILITIES } from "./schema.js";
import { resolveBindings } from "./resolve.js";

// Reconciliation is a pure, deterministic projection over
//   ratified seed + realization witness + canonical System Model + coverage.
// It mutates nothing, persists no combined graph, and never calls an LLM.
// Binding state (unbound/resolved/ambiguous/stale) stays separate from the
// verification verdict (holds/violated/cannot_verify/not_checkable).

function byId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function uniqueEvidence(entries) {
  const seen = new Map();
  for (const entry of entries.flat()) {
    if (!entry) continue;
    const key = JSON.stringify(entry);
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function literalTokens(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

// Literal targets match deterministically: normalize both sides to token
// sequences; the seed literal holds when its tokens are an exact match or a
// contiguous phrase inside the observed Claim literal.
export function literalMatches(seedLiteral, claimValue) {
  const wanted = literalTokens(seedLiteral);
  const actual = literalTokens(claimValue);
  if (!wanted.length || wanted.length > actual.length) return false;
  for (let start = 0; start + wanted.length <= actual.length; start += 1) {
    if (wanted.every((token, offset) => actual[start + offset] === token)) return true;
  }
  return false;
}

const STRONG_CLAIM_STATES = new Set(["observed", "inferred"]);

function aggregateBindingState(records) {
  if (!records.length) return { state: "unbound", elementIds: [] };
  const resolved = records.filter((record) => record.state === "resolved");
  if (resolved.length) {
    return { state: "resolved", elementIds: uniqueSorted(resolved.flatMap((record) => record.elementIds)) };
  }
  if (records.every((record) => record.state === "stale")) return { state: "stale", elementIds: [] };
  return { state: "ambiguous", elementIds: [] };
}


function checkCommitment(model, commitment, context) {
  const { bindingsByConcept, resolution, witnessesByCommitment } = context;
  const witnessEntries = witnessesByCommitment.get(commitment.id) ?? [];

  const sourceBindingIds = witnessEntries.length
    ? uniqueSorted(witnessEntries.map((witness) => witness.sourceBinding))
    : (bindingsByConcept.get(commitment.source) ?? []).map((binding) => binding.id);
  const sourceRecords = sourceBindingIds.map((id) => resolution.get(id) ?? {
    id, concept: commitment.source, state: "stale", reason: "unknown-binding", elementIds: [],
  });
  const source = aggregateBindingState(sourceRecords);

  const citedBindings = [...sourceRecords].sort(byId);
  const result = {
    id: commitment.id,
    source: commitment.source,
    relation: commitment.relation,
    target: commitment.target,
    bindingState: source.state,
    verdict: null,
    reasons: [],
    bindings: citedBindings,
    claimIds: [],
    evidence: [],
    implementationPath: [],
    coverage: [],
  };

  if (!(commitment.relation in RELATION_CAPABILITIES)) {
    result.verdict = "not_checkable";
    result.reasons = ["no-checker-semantics"];
    return result;
  }
  if (source.state !== "resolved") {
    result.verdict = "cannot_verify";
    result.reasons = [source.state === "unbound" ? "unbound-source"
      : source.state === "stale" ? "stale-source" : "ambiguous-source"];
    return result;
  }

  const sourceElementIds = new Set(source.elementIds);
  const conceptTarget = commitment.target?.concept;
  let targetElementIds = null;
  if (conceptTarget !== undefined) {
    const targetRecords = (bindingsByConcept.get(conceptTarget) ?? [])
      .map((binding) => resolution.get(binding.id) ?? {
        id: binding.id, concept: conceptTarget, state: "stale", reason: "unknown-binding", elementIds: [],
      });
    citedBindings.push(...targetRecords);
    result.bindings = uniqueSorted(citedBindings.map((binding) => binding.id))
      .map((id) => citedBindings.find((binding) => binding.id === id));
    const target = aggregateBindingState(targetRecords);
    if (target.state !== "resolved") {
      result.bindingState = target.state;
      result.verdict = "cannot_verify";
      result.reasons = [target.state === "unbound" ? "unbound-target"
        : target.state === "stale" ? "stale-target" : "ambiguous-target"];
      return result;
    }
    targetElementIds = new Set(target.elementIds);
  }


  const targetMatches = (claim) => {
    if (conceptTarget !== undefined) {
      return claim.target?.kind === "reference" && targetElementIds.has(claim.target.id);
    }
    return claim.target?.kind === "literal" && literalMatches(commitment.target?.literal, claim.target.value);
  };
  const candidates = (model.claims ?? [])
    .filter((claim) => sourceElementIds.has(claim.sourceId) && claim.relation === commitment.relation && targetMatches(claim))
    .sort(byId);
  const strong = candidates.filter((claim) => STRONG_CLAIM_STATES.has(claim.claimState));
  const weak = candidates.filter((claim) => !STRONG_CLAIM_STATES.has(claim.claimState));

  if (strong.length) {
    result.verdict = "holds";
    result.claimIds = strong.map((claim) => claim.id);
    result.evidence = uniqueEvidence(strong.map((claim) => claim.evidence ?? []));
    result.implementationPath = uniqueEvidence(strong.map((claim) => claim.implementationPath ?? []));
    return result;
  }
  if (weak.length) {
    result.verdict = "cannot_verify";
    result.reasons = ["claim-not-confirmed"];
    result.claimIds = weak.map((claim) => claim.id);
    result.evidence = uniqueEvidence(weak.map((claim) => claim.evidence ?? []));
    return result;
  }

  // Absence discipline: a missing Claim is a violation only when a capability
  // responsible for this relation reports `analyzed` for the resolved scope.
  const capabilities = RELATION_CAPABILITIES[commitment.relation];
  const elementById = new Map((model.elements ?? []).map((element) => [element.id, element]));
  const scopes = uniqueSorted([...sourceElementIds]
    .map((id) => elementById.get(id)?.subsystemId)
    .filter(Boolean));
  const relevant = (model.coverage ?? [])
    .filter((record) => capabilities.includes(record.capability) && scopes.includes(record.scopeId))
    .map((record) => ({ capability: record.capability, scopeId: record.scopeId, state: record.state }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  result.coverage = relevant;
  if (relevant.some((record) => record.state === "analyzed")) {
    result.verdict = "violated";
    result.reasons = ["claim-absent-under-analyzed-coverage"];
  } else {
    result.verdict = "cannot_verify";
    result.reasons = ["insufficient-coverage"];
  }
  return result;
}

export function reconcile({ model, seed, realization = null }) {
  const currentSeedHash = seedContentHash(seed);
  const bindings = [...(realization?.bindings ?? [])].sort(byId);
  const witnesses = [...(realization?.witnesses ?? [])]
    .sort((a, b) => `${a.commitment} ${a.sourceBinding}`.localeCompare(`${b.commitment} ${b.sourceBinding}`));
  const resolution = realization
    ? resolveBindings(model, realization, currentSeedHash)
    : new Map();

  const context = {
    bindingsByConcept: new Map(),
    resolution,
    witnessesByCommitment: new Map(),
  };
  for (const binding of bindings) {
    const list = context.bindingsByConcept.get(binding.concept) ?? [];
    list.push(binding);
    context.bindingsByConcept.set(binding.concept, list);
  }
  for (const witness of witnesses) {
    const list = context.witnessesByCommitment.get(witness.commitment) ?? [];
    list.push(witness);
    context.witnessesByCommitment.set(witness.commitment, list);
  }

  const commitments = [...(seed.commitments ?? [])].sort(byId)
    .map((commitment) => checkCommitment(model, commitment, context));
  const count = (verdict) => commitments.filter((item) => item.verdict === verdict).length;
  const bindingCount = (state) => commitments.filter((item) => item.bindingState === state).length;

  return {
    formatVersion: 1,
    system: model.system ? { id: model.system.id, key: model.system.key, name: model.system.name } : null,
    seedHash: currentSeedHash,
    ratified: seed.ratification?.status === "ratified",
    realization: realization
      ? {
        present: true,
        seedHash: realization.seedHash,
        stale: realization.seedHash !== currentSeedHash,
        builder: realization.builder ?? null,
      }
      : { present: false, seedHash: null, stale: false, builder: null },
    commitments,
    context: [...(seed.context ?? [])].sort(byId).map((entry) => ({ id: entry.id, text: entry.text })),
    summary: {
      total: commitments.length,
      holds: count("holds"),
      violated: count("violated"),
      cannotVerify: count("cannot_verify"),
      notCheckable: count("not_checkable"),
      binding: {
        resolved: bindingCount("resolved"),
        unbound: bindingCount("unbound"),
        ambiguous: bindingCount("ambiguous"),
        stale: bindingCount("stale"),
      },
    },
  };
}

