export const STANDARD_QUALIFIERS = Object.freeze([
  "platform",
  "storage",
  "http_status",
  "event",
  "direction",
  "cardinality",
  "condition",
  "delivery",
  "application_state",
  "optionality",
  "execution_mode",
  "timeout",
  "queue",
  "concurrency",
  "type",
  "format",
  "media_type",
  // Gate 2 (plan §2.1/§4.1): state-transition and field-contract qualifiers.
  "resource",
  "state_from",
  "required",
]);

export function createQualifierRegistry(additional = []) {
  return new Set([...STANDARD_QUALIFIERS, ...additional]);
}

export const DEFAULT_QUALIFIER_REGISTRY = createQualifierRegistry();
