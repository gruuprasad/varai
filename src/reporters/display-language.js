// The single owner of user-facing wording for kernel vocabulary. The markdown
// reporters import it directly; the server passes displayLanguage() to the UI.

export const RELATION_LABELS = Object.freeze({
  contains: "contains", exposes: "exposes", offers: "offers", triggered_by: "is triggered by",
  invokes: "invokes", accepts: "accepts", produces: "produces", requires: "requires",
  available_when: "is available when", reads: "reads", changes: "changes", creates: "creates",
  removes: "removes", succeeds_with: "succeeds with", fails_with: "fails with",
  navigates_to: "navigates to", emits: "emits", has_field: "has field",
  relates_to: "relates to", stored_in: "is stored in",
});

export const KIND_LABELS = Object.freeze({
  aggregate: "in-memory model", entity: "stored record", contract: "data contract",
  state: "UI state", screen: "screen", surface: "panel", component: "component",
  action: "action", operation: "API operation", command: "command", process: "service",
});

export const CLAIM_STATE_LABELS = Object.freeze({
  observed: "", inferred: "inferred",
  unverified: "not verified", ambiguous: "ambiguous — multiple candidates matched",
});

export function kindLabel(kind) {
  return KIND_LABELS[kind] ?? kind;
}

export function claimStateLabel(state) {
  return CLAIM_STATE_LABELS[state] ?? state;
}

export function displayLanguage() {
  return { relations: RELATION_LABELS, kinds: KIND_LABELS, claimStates: CLAIM_STATE_LABELS };
}

// Human wording for the reconciliation + seed vocabulary. The engine keeps its
// precise enums (holds/violated/…, resolved/stale/…, ratification.status); this
// is the only place a person's words live. Redline these strings to taste.
export const VERDICT_LABELS = Object.freeze({
  holds: "confirmed",
  violated: "missing",
  cannot_verify: "couldn't tell",
  not_checkable: "noted",
});

export const BINDING_STATE_LABELS = Object.freeze({
  resolved: "found in the code",
  ambiguous: "matched several places",
  stale: "out of date",
  unbound: "no location given",
});

export const REASON_LABELS = Object.freeze({
  "insufficient-coverage": "couldn't analyze this fully",
  "claim-absent-under-analyzed-coverage": "expected in the code but not found",
  "claim-not-confirmed": "found something, but couldn't confirm it",
  "unbound-source": "no location was given for it",
  "unbound-target": "no location was given for what it points at",
  "stale-source": "the builder's map is out of date",
  "stale-target": "the builder's map is out of date",
  "ambiguous-source": "it matched more than one place",
  "ambiguous-target": "what it points at matched more than one place",
  "no-checker-semantics": "varai can't check this kind of rule yet",
  "concept-collision": "two requirements point at the same code",
  "artifact-not-found": "the code it named isn't there",
  "seed-hash-mismatch": "the builder's map was made for an older spec",
});

// Nouns for the approval/spec vocabulary, used in prose surfaces.
export const SEED_VOCAB = Object.freeze({
  approved: "approved",        // internal: ratified
  draft: "draft",
  spec: "spec",                // internal: seed
  requirement: "requirement",  // internal: commitment
  builderMap: "builder's map", // internal: realization witness
  check: "check",              // internal: reconciliation
});

export function verdictLabel(verdict) {
  return VERDICT_LABELS[verdict] ?? verdict;
}
export function bindingStateLabel(state) {
  return BINDING_STATE_LABELS[state] ?? state;
}
export function reasonLabel(code) {
  return REASON_LABELS[code] ?? code;
}
