// `varai runtime derive`: regenerate runtime operation mappings from the
// current System Model, approved API surface bindings, and scenario
// principals — preserving stable runtime profile fields (start command, base
// URL, health path, persona credentials/headers) from a valid baseline.
// Derive never invents profile configuration: without a baseline it reports
// the exact unresolved fields and exits non-zero. Print by default; write only
// with explicit --write.

import { seedContentHash } from "../seed/identity.js";
import { resolveSurfaceBindings } from "../reconciliation/resolve.js";

const METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/;

export function parseOperationKey(key) {
  const match = METHOD_PATTERN.exec(String(key ?? "").trim());
  if (!match) return null;
  return { method: match[1], path: match[2] };
}

// Profile fields are stable application configuration; operations and the
// seed hash are regenerated. The latest matching verification run stores the
// runtime object by hash, so a runtime map from the last successful run also
// counts as a baseline.
export function pickRuntimeProfile(currentRuntime, baselineRuntime) {
  const source = currentRuntime ?? baselineRuntime ?? null;
  const missing = [];
  if (!source) return { source: null, profile: null, missing: ["baseUrl", "healthPath", "start", "personas"] };
  const baseUrl = typeof source.baseUrl === "string" && source.baseUrl ? source.baseUrl : null;
  const healthPath = typeof source.healthPath === "string" && source.healthPath ? source.healthPath : null;
  const start = source.start && typeof source.start.executable === "string"
    && Array.isArray(source.start.args) && source.start.args.length ? source.start : null;
  const personas = Array.isArray(source.personas) && source.personas.length ? source.personas : null;
  const profile = {};
  if (baseUrl) profile.baseUrl = baseUrl; else missing.push("baseUrl");
  if (healthPath) profile.healthPath = healthPath; else missing.push("healthPath");
  if (start) profile.start = start; else missing.push("start");
  if (personas) profile.personas = personas; else missing.push("personas");
  return {
    source: source === currentRuntime ? "current-runtime-map" : source === baselineRuntime ? "verification-run" : null,
    profile: missing.length ? null : profile,
    missing,
  };
}

export function deriveRuntimeMap({ model, seed, realization, currentRuntime, baselineRuntime } = {}) {
  const seedHash = seedContentHash(seed);
  const problems = [];
  const profilePick = pickRuntimeProfile(currentRuntime, baselineRuntime);

  const surfaceResolution = resolveSurfaceBindings(model, realization, seedHash);
  const elementsById = new Map((model.elements ?? []).map((element) => [element.id, element]));
  const surfacesById = new Map((seed.surfaces ?? []).map((surface) => [surface.id, surface]));
  const operations = [];
  const seenBehaviors = new Set();

  for (const binding of [...(realization?.surfaceBindings ?? [])]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const record = surfaceResolution.get(binding.id);
    if (!record || record.state !== "resolved" || record.elementIds.length !== 1) {
      problems.push({
        code: "surface-unresolved",
        message: `Surface binding ${binding.id} is not resolved to exactly one element`,
      });
      continue;
    }
    const element = elementsById.get(record.elementIds[0]);
    if (!element) continue;
    const parsed = parseOperationKey(element.key);
    if (!parsed) {
      problems.push({
        code: "surface-not-operation",
        message: `Surface binding ${binding.id} resolves to ${element.key}, which is not an HTTP operation`,
      });
      continue;
    }
    const surface = surfacesById.get(binding.surface);
    const behavior = surface?.behavior;
    if (!behavior) {
      problems.push({ code: "surface-no-behavior", message: `Surface binding ${binding.id} has no behavior in the seed` });
      continue;
    }
    if (seenBehaviors.has(behavior)) {
      problems.push({
        code: "behavior-duplicate",
        message: `Multiple surfaces bind to behavior ${behavior}; runtime operations must be unique per behavior`,
      });
      continue;
    }
    seenBehaviors.add(behavior);
    operations.push({ behavior, method: parsed.method, path: parsed.path });
  }
  operations.sort((a, b) => String(a.behavior).localeCompare(String(b.behavior)));

  const runtime = profilePick.profile
    ? { formatVersion: 1, seedHash, ...profilePick.profile, operations }
    : null;

  return {
    ok: problems.length === 0 && runtime !== null,
    problems,
    unresolved: profilePick.missing,
    profileSource: profilePick.source,
    runtime,
  };
}
