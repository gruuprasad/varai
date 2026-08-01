// Pure surface accounting: resolve ratified Seed surfaces against observed
// public Elements in both directions. Commitments answer "did you build what
// was asked?"; this projection answers "what public behavior exists that was
// not asked for?" Concept bindings never count as surface approval.

import { publicSurfaceElements } from "./public-surfaces.js";
import { resolveSurfaceBindings } from "./resolve.js";
import { seedContentHash } from "../seed/identity.js";

function byId(a, b) {
  return String(a.id ?? a.surfaceId ?? a.elementId).localeCompare(String(b.id ?? b.surfaceId ?? b.elementId));
}

function emptyBuckets(state, reason = null) {
  return {
    state,
    ...(reason ? { reason } : {}),
    expected: [],
    accounted: [],
    missing: [],
    unaccounted: [],
    ambiguous: [],
    stale: [],
  };
}

function surfaceRecord(surface) {
  return {
    id: surface.id,
    name: surface.name,
    behavior: surface.behavior,
    channel: surface.channel,
    access: surface.access,
  };
}

function elementRef(element) {
  return {
    elementId: element.id,
    key: element.key,
    kind: element.kind,
    name: element.name,
    ...((element.evidence?.length ? { evidence: [...element.evidence] } : {})),
  };
}

function bindingsForSurface(realization, surfaceId) {
  return [...(realization?.surfaceBindings ?? [])]
    .filter((binding) => binding.surface === surfaceId)
    .sort(byId);
}

export function accountSurfaces({
  model,
  seed,
  realization = null,
  surfaceResolution = null,
} = {}) {
  // Seed v1/v2 have no surfaces array — do not pretend the world is closed.
  if (!Array.isArray(seed?.surfaces)) {
    return emptyBuckets("cannot_account", "seed-surfaces-absent");
  }

  const currentSeedHash = seedContentHash(seed);
  const resolution = surfaceResolution
    ?? (realization ? resolveSurfaceBindings(model, realization, currentSeedHash) : new Map());

  const expected = [...seed.surfaces].sort(byId).map(surfaceRecord);
  const accounted = [];
  const missing = [];
  const ambiguous = [];
  const stale = [];

  const claimedElementIds = new Map(); // elementId -> [surfaceId, ...]
  const publicById = new Map(publicSurfaceElements(model).map((element) => [element.id, element]));

  for (const surface of [...seed.surfaces].sort(byId)) {
    const bindings = bindingsForSurface(realization, surface.id);
    if (!bindings.length) {
      missing.push({ surfaceId: surface.id, reason: "unbound" });
      continue;
    }

    const records = bindings.map((binding) => resolution.get(binding.id) ?? {
      id: binding.id,
      surface: surface.id,
      state: "stale",
      reason: "unknown-binding",
      elementIds: [],
    });

    const resolved = records.filter((record) => record.state === "resolved");
    const staleRecords = records.filter((record) => record.state === "stale");
    const ambiguousRecords = records.filter((record) => record.state === "ambiguous");

    if (ambiguousRecords.length) {
      for (const record of ambiguousRecords) {
        ambiguous.push({
          surfaceId: surface.id,
          bindingId: record.id,
          elementIds: [...(record.elementIds ?? [])],
          reason: record.reason ?? "selector-ambiguous",
        });
      }
      continue;
    }

    // Fail closed: a surface with both clean and stale bindings is not accounted.
    if (staleRecords.length && resolved.length) {
      for (const record of staleRecords) {
        stale.push({
          surfaceId: surface.id,
          bindingId: record.id,
          reason: record.reason ?? "artifact-not-found",
        });
      }
      // Occupy every Element the mixed bindings pointed at so they are not
      // also reported as unaccounted.
      for (const elementId of new Set(records.flatMap((record) => record.elementIds ?? []))) {
        const owners = claimedElementIds.get(elementId) ?? [];
        if (!owners.includes(surface.id)) owners.push(surface.id);
        claimedElementIds.set(elementId, owners);
      }
      continue;
    }

    if (staleRecords.length && !resolved.length) {
      for (const record of staleRecords) {
        stale.push({
          surfaceId: surface.id,
          bindingId: record.id,
          reason: record.reason ?? "artifact-not-found",
        });
      }
      continue;
    }

    // A surface must claim exactly one public Element.
    const elementIds = [...new Set(resolved.flatMap((record) => record.elementIds))].sort();
    if (elementIds.length === 0) {
      missing.push({ surfaceId: surface.id, reason: "unbound" });
      continue;
    }
    if (elementIds.length > 1) {
      ambiguous.push({
        surfaceId: surface.id,
        bindingId: resolved[0]?.id ?? null,
        elementIds,
        reason: "surface-multi-element",
      });
      continue;
    }

    const elementId = elementIds[0];
    const element = publicById.get(elementId);
    if (!element) {
      stale.push({
        surfaceId: surface.id,
        bindingId: resolved[0]?.id ?? null,
        reason: "not-public-element",
      });
      continue;
    }

    const owners = claimedElementIds.get(elementId) ?? [];
    owners.push(surface.id);
    claimedElementIds.set(elementId, owners);

    accounted.push({
      surfaceId: surface.id,
      elementId,
      bindingId: resolved[0].id,
      key: element.key,
      kind: element.kind,
      name: element.name,
    });
  }

  // Two surfaces claiming the same Element → ambiguous (revoke accounted).
  const collided = new Set(
    [...claimedElementIds].filter(([, surfaces]) => surfaces.length > 1).map(([elementId]) => elementId));
  if (collided.size) {
    const revoked = accounted.filter((item) => collided.has(item.elementId));
    for (const item of revoked) {
      ambiguous.push({
        surfaceId: item.surfaceId,
        bindingId: item.bindingId,
        elementIds: [item.elementId],
        reason: "surface-collision",
      });
    }
    for (let i = accounted.length - 1; i >= 0; i -= 1) {
      if (collided.has(accounted[i].elementId)) accounted.splice(i, 1);
    }
  }

  // Occupied = accounted + every Element an ambiguous claim selected + any
  // Element held by a mixed/failed-closed claim via claimedElementIds.
  // Ambiguous ≠ unaccounted.
  const claimed = new Set([
    ...accounted.map((item) => item.elementId),
    ...claimedElementIds.keys(),
  ]);
  for (const item of ambiguous) {
    for (const elementId of item.elementIds ?? []) claimed.add(elementId);
  }

  const unaccounted = publicSurfaceElements(model)
    .filter((element) => !claimed.has(element.id))
    .map(elementRef)
    .sort(byId);

  return {
    state: "closed",
    expected,
    accounted: accounted.sort((a, b) => a.surfaceId.localeCompare(b.surfaceId)),
    missing: missing.sort((a, b) => a.surfaceId.localeCompare(b.surfaceId)),
    unaccounted,
    ambiguous: ambiguous.sort((a, b) => String(a.surfaceId).localeCompare(String(b.surfaceId))),
    stale: stale.sort((a, b) => a.surfaceId.localeCompare(b.surfaceId)),
  };
}

export function surfacesSummary(surfaces) {
  if (!surfaces) {
    return { expected: 0, accounted: 0, missing: 0, unaccounted: 0, ambiguous: 0, stale: 0 };
  }
  return {
    expected: surfaces.expected?.length ?? 0,
    accounted: surfaces.accounted?.length ?? 0,
    missing: surfaces.missing?.length ?? 0,
    unaccounted: surfaces.unaccounted?.length ?? 0,
    ambiguous: surfaces.ambiguous?.length ?? 0,
    stale: surfaces.stale?.length ?? 0,
    ...(surfaces.state ? { state: surfaces.state } : {}),
    ...(surfaces.reason ? { reason: surfaces.reason } : {}),
  };
}
