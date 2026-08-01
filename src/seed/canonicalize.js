import { canonicalizeValue } from "../system-model/canonicalize.js";

// Canonical seed form: collections ordered by stable id, object keys sorted.
// Reordering the input document must produce a byte-identical canonical form.
// Seed v4 state models are canonicalized so that reordering states or
// transitions alone creates no semantic diff (plan §2.1: transition identity
// is (resource, from, to, via)).

function sortById(items) {
  return [...items].sort((a, b) => String(a?.id ?? "").localeCompare(String(b?.id ?? "")));
}

function transitionKey(transition) {
  const via = [...(transition.via ?? [])].sort().join(",");
  return `${transition.from}\0${transition.to}\0${via}`;
}

function canonicalizeConcept(concept) {
  const canonical = canonicalizeValue(concept);
  if (concept?.stateModel) {
    canonical.stateModel = canonicalizeValue({
      ...concept.stateModel,
      states: [...(concept.stateModel.states ?? [])].sort(),
      transitions: [...(concept.stateModel.transitions ?? [])]
        .sort((a, b) => transitionKey(a).localeCompare(transitionKey(b))),
    });
  }
  if (Array.isArray(concept?.fields)) {
    canonical.fields = [...concept.fields]
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
      .map((field) => canonicalizeValue(field));
  }
  return canonical;
}

export function canonicalizeSeed(seed) {
  return canonicalizeValue({
    formatVersion: seed.formatVersion,
    system: seed.system,
    concepts: sortById(seed.concepts ?? []).map(canonicalizeConcept),
    commitments: sortById(seed.commitments ?? []),
    ...(seed.formatVersion >= 3 ? {
      surfaces: sortById(seed.surfaces ?? []),
      scenarios: sortById(seed.scenarios ?? []),
    } : {}),
    ...(seed.formatVersion >= 4 ? {
      flows: sortById(seed.flows ?? []),
    } : {}),
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
