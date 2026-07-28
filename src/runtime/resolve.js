// Cross-resolve runtime operations against approved surfaceBindings and
// canonical API Elements. Personas are allocated distinctly per principal.
// This module never executes HTTP; it only checks that pointers agree.

import { resolveSurfaceBindings } from "../reconciliation/resolve.js";

function normalizePathParam(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

export function normalizeRoutePath(routePath) {
  return String(routePath ?? "")
    .replace(/\/{2,}/g, "/")
    .replace(/\{([^}/]+)\}/g, (_, name) => `{${normalizePathParam(name)}}`)
    || "/";
}

export function operationElementKey(method, routePath) {
  return `${String(method ?? "").toUpperCase()} ${normalizeRoutePath(routePath)}`.trim();
}

function surfaceBehaviorIndex(seed) {
  const byBehavior = new Map();
  for (const surface of seed?.surfaces ?? []) {
    if (surface.channel !== "api") continue;
    const list = byBehavior.get(surface.behavior) ?? [];
    list.push(surface);
    byBehavior.set(surface.behavior, list);
  }
  return byBehavior;
}

function elementByKey(model) {
  const map = new Map();
  for (const element of model?.elements ?? []) {
    if (element.kind === "operation") map.set(element.key, element);
  }
  return map;
}

export function resolveRuntimeOperations({
  model,
  seed,
  realization,
  runtime,
  seedHash,
} = {}) {
  const problems = [];
  const operations = new Map();
  if (!realization) {
    return { ok: false, problems: [{ code: "missing-realization", message: "Runtime resolution requires varai.realization.json" }], operations };
  }
  if (realization.seedHash !== seedHash) {
    problems.push({ code: "seed-hash-mismatch", message: "Realization seedHash does not match the approved Seed" });
  }
  if (runtime?.seedHash !== seedHash) {
    problems.push({ code: "seed-hash-mismatch", message: "Runtime map seedHash does not match the approved Seed" });
  }

  const surfaceResolution = resolveSurfaceBindings(model, realization, seedHash);
  const surfacesByBehavior = surfaceBehaviorIndex(seed);
  const elements = elementByKey(model);
  const resolvedSurfaceElements = new Map();
  for (const binding of realization.surfaceBindings ?? []) {
    const record = surfaceResolution.get(binding.id);
    if (!record || record.state !== "resolved" || record.elementIds.length !== 1) continue;
    const element = (model.elements ?? []).find((item) => item.id === record.elementIds[0]);
    if (!element) continue;
    const surface = (seed.surfaces ?? []).find((item) => item.id === binding.surface);
    if (!surface) continue;
    resolvedSurfaceElements.set(surface.id, { binding, surface, element, record });
  }

  for (const operation of runtime?.operations ?? []) {
    const key = operationElementKey(operation.method, operation.path);
    const element = elements.get(key);
    const apiSurfaces = surfacesByBehavior.get(operation.behavior) ?? [];
    if (!apiSurfaces.length) {
      problems.push({
        code: "operation-unresolved",
        message: `Runtime operation ${operation.behavior} has no ratified api surface`,
      });
      continue;
    }
    const matches = apiSurfaces
      .map((surface) => resolvedSurfaceElements.get(surface.id))
      .filter(Boolean)
      .filter((entry) => entry.element.key === key);
    if (!element) {
      problems.push({
        code: "operation-unresolved",
        message: `Runtime operation ${operation.behavior} path ${key} is not an observed API Element`,
      });
      continue;
    }
    if (!matches.length) {
      problems.push({
        code: "operation-unresolved",
        message: `Runtime operation ${operation.behavior} (${key}) does not match any approved surface binding for that behavior`,
      });
      continue;
    }
    if (matches.length > 1) {
      problems.push({
        code: "operation-ambiguous",
        message: `Runtime operation ${operation.behavior} matches multiple surface bindings`,
      });
      continue;
    }
    operations.set(operation.behavior, {
      behavior: operation.behavior,
      method: operation.method.toUpperCase(),
      path: operation.path,
      elementKey: key,
      elementId: element.id,
      surfaceId: matches[0].surface.id,
      surfaceBindingId: matches[0].binding.id,
    });
  }

  return { ok: problems.length === 0, problems, operations };
}

export function allocatePersonas({ principals, personas } = {}) {
  return resolveScenarioPrincipals({ principals, personas });
}

export function resolveScenarioPrincipals({ principals, personas } = {}) {
  const byAlias = {};
  const used = new Set();
  const available = [...(personas ?? [])];
  for (const principal of principals ?? []) {
    const match = available.find((persona) =>
      persona.actor === principal.actor && !used.has(persona.id));
    if (!match) {
      return {
        ok: false,
        problems: [{
          code: "persona-unavailable",
          message: `No unused persona configured for actor ${principal.actor} (principal ${principal.as})`,
        }],
        byAlias,
      };
    }
    used.add(match.id);
    byAlias[principal.as] = match;
  }
  return { ok: true, problems: [], byAlias };
}
