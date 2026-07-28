import { SEED_FORMAT_VERSION } from "./schema.js";
import { validateSeed } from "./validate.js";

// Explicit only: callers decide whether to print or write this new, unapproved
// document. A v2 content hash necessarily differs because expectation is now
// part of human intent.
export function migrateSeedToCurrent(seed) {
  validateSeed(seed);
  if (seed.formatVersion === SEED_FORMAT_VERSION) return structuredClone(seed);
  if (seed.formatVersion !== 1) throw new Error(`Cannot migrate seed format version ${seed.formatVersion}`);
  return {
    ...seed,
    formatVersion: SEED_FORMAT_VERSION,
    commitments: (seed.commitments ?? []).map((commitment) => ({ ...commitment, expectation: "present" })),
    ratification: { status: "draft" },
  };
}
