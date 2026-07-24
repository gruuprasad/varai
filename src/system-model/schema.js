export const RELATIONSHIPS = Object.freeze([
  "contains", "exposes", "offers",
  "triggered_by", "invokes",
  "accepts", "produces",
  "requires", "available_when",
  "reads", "changes", "creates", "removes",
  "succeeds_with", "fails_with", "navigates_to", "emits",
  "has_field", "relates_to", "stored_in",
  "depends_on",
]);

export const ELEMENT_ROLES = Object.freeze(["interface", "behavior", "resource"]);
export const CLAIM_STATES = Object.freeze(["observed", "inferred", "unverified", "ambiguous"]);
export const OBSERVATION_METHODS = Object.freeze(["ast", "manifest", "semantic", "convention"]);
export const COVERAGE_STATES = Object.freeze(["analyzed", "partial", "unsupported", "failed"]);

export const REFERENCE_TARGET = "reference";
export const LITERAL_TARGET = "literal";
