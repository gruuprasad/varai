// The deterministic contract for every authored Seed relation. This is the
// one place reconciliation learns whether a relation is checkable, what
// canonical analyzer capability can establish its absence, and how literal
// targets compare. Seed grammar remains in src/seed/schema.js.

import { RECORDED_ONLY_RELATIONS } from "../seed/schema.js";

export const STRONG_CLAIM_STATES = Object.freeze(new Set(["observed", "inferred"]));

const CHECKABLE_RELATIONS = Object.freeze({
  invokes: { capabilities: ["ui.api-link", "application.operation"], coverageGrain: "element" },
  accepts: { capabilities: ["api.input"], coverageGrain: "element" },
  requires: { capabilities: ["api.condition", "ui.availability"], coverageGrain: "element" },
  reads: { capabilities: ["api.effect", "application.effect"], coverageGrain: "element" },
  changes: { capabilities: ["api.effect", "application.effect"], coverageGrain: "element" },
  creates: { capabilities: ["api.effect", "application.effect"], coverageGrain: "element" },
  removes: { capabilities: ["api.effect", "application.effect"], coverageGrain: "element" },
  produces: { capabilities: ["api.output"], coverageGrain: "element" },
  fails_with: { capabilities: ["api.failure"], coverageGrain: "element" },
  emits: { capabilities: [], coverageGrain: "element" },
  // Python import analysis is explicitly subsystem-complete only when it emits
  // an analyzed arch.dependency record for that scope.
  depends_on: { capabilities: ["arch.dependency"], coverageGrain: "subsystem" },
});

export const RELATION_CAPABILITIES = Object.freeze(Object.fromEntries(
  Object.entries(CHECKABLE_RELATIONS).map(([relation, contract]) =>
    [relation, Object.freeze([...contract.capabilities])]),
));

export function relationContract(relation) {
  const checkable = CHECKABLE_RELATIONS[relation];
  if (checkable) return { relation, checkable: true, ...checkable };
  return {
    relation,
    checkable: false,
    recordedOnly: RECORDED_ONLY_RELATIONS.includes(relation),
    capabilities: [],
    coverageGrain: null,
  };
}

function literalTokens(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

// Literal targets match deterministically: normalize both sides to token
// sequences; the Seed literal holds when its tokens are an exact match or a
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

export function partitionClaims(claims) {
  return {
    strong: claims.filter((claim) => STRONG_CLAIM_STATES.has(claim.claimState)),
    weak: claims.filter((claim) => !STRONG_CLAIM_STATES.has(claim.claimState)),
  };
}
