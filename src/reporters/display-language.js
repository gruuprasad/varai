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
