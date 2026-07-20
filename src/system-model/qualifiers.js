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
]);

export function createQualifierRegistry(additional = []) {
  return new Set([...STANDARD_QUALIFIERS, ...additional]);
}

export const DEFAULT_QUALIFIER_REGISTRY = createQualifierRegistry();
