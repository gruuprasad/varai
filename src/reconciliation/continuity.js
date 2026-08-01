// Binding-continuity projection (plan §3.5): compare the current resolved
// mapping with the latest prior `ready` build session — no separate ledger is
// added, because completed sessions already persist the Seed, realization,
// and start/completion snapshots by object hash. A concept that points to a
// different element reports `rebound` with the old element's fate from the
// stored snapshot (gone, renamed, or still present); unchanged mappings
// report `carried`. Purely deterministic; it never mutates anything.

import { seedContentHash } from "../seed/identity.js";
import { resolveBindings } from "./resolve.js";

export function projectContinuity({
  currentModel,
  currentSeed,
  currentRealization,
  priorModel,
  priorSeed,
  priorRealization,
} = {}) {
  if (!priorModel || !priorSeed || !priorRealization) {
    return { present: false, summary: { carried: 0, rebound: 0, new: 0, unresolvable: 0 }, entries: [] };
  }
  const currentHash = seedContentHash(currentSeed);
  const priorHash = seedContentHash(priorSeed);
  const currentResolution = resolveBindings(currentModel, currentRealization, currentHash);
  const priorResolution = resolveBindings(priorModel, priorRealization, priorHash);

  const priorByConcept = new Map();
  for (const record of priorResolution.values()) {
    const list = priorByConcept.get(record.concept) ?? [];
    list.push(record);
    priorByConcept.set(record.concept, list);
  }
  const currentElements = new Map((currentModel.elements ?? []).map((element) => [element.id, element]));
  const priorElements = new Map((priorModel.elements ?? []).map((element) => [element.id, element]));
  const currentByKey = new Map();
  for (const element of currentModel.elements ?? []) {
    currentByKey.set(`${element.kind}\0${element.key}`, element);
  }

  const entries = [];
  for (const id of [...currentResolution.keys()].sort()) {
    const record = currentResolution.get(id);
    const prior = priorByConcept.get(record.concept) ?? [];
    const entry = { id, concept: record.concept };
    if (record.state !== "resolved") {
      entries.push({ ...entry, state: "unresolvable", reason: record.reason ?? record.state });
      continue;
    }
    const priorResolved = prior.filter((item) => item.state === "resolved");
    if (!priorResolved.length) {
      entries.push({ ...entry, state: "new" });
      continue;
    }
    const priorIds = new Set(priorResolved.flatMap((item) => item.elementIds));
    const currentIds = new Set(record.elementIds);
    const same = priorIds.size === currentIds.size && [...priorIds].every((elementId) => currentIds.has(elementId));
    if (same) {
      entries.push({ ...entry, state: "carried" });
      continue;
    }
    const oldElementFates = [];
    for (const elementId of [...priorIds].sort()) {
      if (currentIds.has(elementId)) continue;
      const priorElement = priorElements.get(elementId);
      if (currentElements.has(elementId)) {
        oldElementFates.push({ elementId, fate: "still-present" });
      } else if (priorElement && currentByKey.has(`${priorElement.kind}\0${priorElement.key}`)) {
        oldElementFates.push({ elementId, fate: "renamed" });
      } else {
        oldElementFates.push({ elementId, fate: "gone" });
      }
    }
    entries.push({
      ...entry,
      state: "rebound",
      from: [...priorIds].sort(),
      to: [...currentIds].sort(),
      oldElementFates,
    });
  }

  const summary = { carried: 0, rebound: 0, new: 0, unresolvable: 0 };
  for (const entry of entries) summary[entry.state] += 1;
  return { present: true, summary, entries };
}
