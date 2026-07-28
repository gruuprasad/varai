import { SEED_FORMAT_VERSION } from "./schema.js";
import { validateSeed } from "./validate.js";

// Explicit only: callers decide whether to print or write this new, unapproved
// document. Migrating to the current format never invents surfaces or scenarios
// from code — those stay empty until a human authors them.

export function migrateSeedToCurrent(seed) {
  validateSeed(seed);
  if (seed.formatVersion === SEED_FORMAT_VERSION) return structuredClone(seed);

  let next = structuredClone(seed);
  if (next.formatVersion === 1) {
    next = {
      ...next,
      formatVersion: 2,
      commitments: (next.commitments ?? []).map((commitment) => ({ ...commitment, expectation: "present" })),
      ratification: { status: "draft" },
    };
  }
  if (next.formatVersion === 2) {
    next = {
      ...next,
      formatVersion: 3,
      surfaces: [],
      scenarios: [],
      ratification: { status: "draft" },
    };
  }
  if (next.formatVersion !== SEED_FORMAT_VERSION) {
    throw new Error(`Cannot migrate seed format version ${seed.formatVersion}`);
  }
  return next;
}
