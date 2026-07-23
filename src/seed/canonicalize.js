import { canonicalizeValue } from "../system-model/canonicalize.js";

// Canonical seed form: collections ordered by stable id, object keys sorted.
// Reordering the input document must produce a byte-identical canonical form.

function sortById(items) {
  return [...items].sort((a, b) => String(a?.id ?? "").localeCompare(String(b?.id ?? "")));
}

export function canonicalizeSeed(seed) {
  return canonicalizeValue({
    formatVersion: seed.formatVersion,
    system: seed.system,
    concepts: sortById(seed.concepts ?? []),
    commitments: sortById(seed.commitments ?? []),
    context: sortById(seed.context ?? []),
    ...(seed.ratification ? { ratification: seed.ratification } : {}),
  });
}

// The semantic content is everything the hash commits to: the whole document
// except ratification metadata.
export function seedSemanticContent(seed) {
  const canonical = canonicalizeSeed(seed);
  delete canonical.ratification;
  return canonical;
}

export function canonicalStringifySeed(value) {
  return JSON.stringify(canonicalizeValue(value), null, 2) + "\n";
}
