// Realization lint (Gate 1): validate a builder witness, resolve it against
// the current System Model, and report deterministic candidates when a
// selector fails. One command for the builder's iteration loop — lint never
// selects or writes a binding, and candidates never affect a verdict.
//
// Lint is read-only over: witness file + ratified seed + current System Model.
// It mutates nothing and never calls an LLM.

import { seedContentHash } from "../seed/identity.js";
import { checkRealization } from "./schema.js";
import { resolveBindings, resolveSurfaceBindings } from "./resolve.js";

export const LINT_CANDIDATE_LIMIT = 5;

function tokenSet(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function tokenOverlap(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

// Deterministic candidate score for an element against an artifact selector.
// Equal scores stay equal; lint ranks, it never selects.
export function candidateScore(element, artifact, lensOf) {
  let score = 0;
  if (artifact.lens && lensOf.get(element.subsystemId) === artifact.lens) score += 4;
  if (artifact.kind && element.kind === artifact.kind) score += 4;
  const key = String(artifact.key ?? "");
  score += tokenOverlap(key, element.key) * 3;
  score += tokenOverlap(key, element.name) * 2;
  const file = artifact.source?.file;
  if (file && (element.evidence ?? []).some((entry) => entry.file === file)) score += 3;
  return score;
}

function rankCandidates(model, artifact, lensOf, excludeIds) {
  const excluded = new Set(excludeIds ?? []);
  return (model.elements ?? [])
    .filter((element) => !excluded.has(element.id))
    .map((element) => ({
      elementId: element.id,
      key: element.key,
      name: element.name,
      kind: element.kind,
      score: candidateScore(element, artifact, lensOf),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || String(a.elementId).localeCompare(String(b.elementId)))
    .slice(0, LINT_CANDIDATE_LIMIT);
}

// Lint presentation state: resolved | ambiguous | not-found | stale.
// Resolution "stale" splits into not-found (selector missed) vs stale (seed
// hash mismatch or unknown binding) so the builder knows which loop to fix.
function lintState(record) {
  if (record.state === "resolved") return "resolved";
  if (record.state === "ambiguous") return "ambiguous";
  if (record.reason === "artifact-not-found") return "not-found";
  return "stale";
}

function lintBindingRecord(model, record, artifact, lensOf) {
  const state = lintState(record);
  const base = {
    id: record.id,
    state,
    ...(record.reason ? { reason: record.reason } : {}),
  };
  if (state === "resolved" || state === "ambiguous") {
    return { ...base, elementIds: [...record.elementIds].sort() };
  }
  if (state === "not-found") {
    return { ...base, candidates: rankCandidates(model, artifact, lensOf) };
  }
  return base;
}

function summaryOf(records) {
  const summary = { total: records.length, resolved: 0, ambiguous: 0, notFound: 0, stale: 0 };
  for (const record of records) summary[record.state] += 1;
  return summary;
}

export function lintRealization({ model, seed, realization }) {
  const currentSeedHash = seedContentHash(seed);
  const schema = checkRealization(realization, { seed });
  const problems = [...schema.problems];
  const seedMatches = realization.seedHash === currentSeedHash;
  if (!seedMatches) {
    problems.push({
      code: "seed-hash-mismatch",
      message: `Realization seedHash ${realization.seedHash} does not match the current seed ${currentSeedHash}`,
    });
  }

  const lensOf = new Map((model.subsystems ?? []).map((subsystem) => [subsystem.id, subsystem.lens]));
  const resolution = seedMatches ? resolveBindings(model, realization, currentSeedHash) : new Map();
  const surfaceResolution = seedMatches ? resolveSurfaceBindings(model, realization, currentSeedHash) : new Map();

  const bindings = [...(realization.bindings ?? [])]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((binding) => {
      const record = resolution.get(binding.id) ?? {
        id: binding.id, concept: binding.concept, state: "stale", reason: "unknown-binding", elementIds: [],
      };
      return lintBindingRecord(model, record, binding.artifact ?? {}, lensOf);
    });

  const surfaceBindings = [...(realization.surfaceBindings ?? [])]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((binding) => {
      const record = surfaceResolution.get(binding.id) ?? {
        id: binding.id, surface: binding.surface, state: "stale", reason: "unknown-binding", elementIds: [],
      };
      return lintBindingRecord(model, record, binding.artifact ?? {}, lensOf);
    });

  return {
    formatVersion: 1,
    seedHash: currentSeedHash,
    seedMatches,
    problems,
    valid: problems.length === 0,
    bindings,
    surfaceBindings,
    summary: { bindings: summaryOf(bindings), surfaceBindings: summaryOf(surfaceBindings) },
  };
}

// A witness is actionable only when every binding is resolved. Lint exit code
// follows the same rule the gate uses: ambiguous and missing selectors are
// work for the builder, never a clean result.
export function lintIsActionable(lint) {
  const anyUnresolved = [...lint.bindings, ...lint.surfaceBindings]
    .some((record) => record.state !== "resolved");
  return lint.valid && !anyUnresolved;
}

