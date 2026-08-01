// Pure Seed (+ observation overlay) projection for the product blueprint.
// Never persists a combined Seed+Model overlay graph — callers recompute.

const OBSERVATION = Object.freeze({
  REALIZED: "realized",
  MISSING: "missing",
  UNACCOUNTED: "unaccounted",
  AMBIGUOUS: "ambiguous",
  UNVERIFIABLE: "unverifiable",
});

function byRole(seed, role) {
  return [...(seed?.concepts ?? [])]
    .filter((concept) => concept.role === role)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((concept) => ({
      id: concept.id,
      name: concept.name,
      summary: concept.summary ?? null,
      role: concept.role,
      observation: null,
      commitmentIds: [],
      evidenceIds: [],
    }));
}

function surfaceObservation(surfaceId, surfaces) {
  if (!surfaces || surfaces.state === "cannot_account") return OBSERVATION.UNVERIFIABLE;
  if ((surfaces.accounted ?? []).some((item) => item.surfaceId === surfaceId)) return OBSERVATION.REALIZED;
  if ((surfaces.missing ?? []).some((item) => item.surfaceId === surfaceId)) return OBSERVATION.MISSING;
  if ((surfaces.ambiguous ?? []).some((item) => item.surfaceId === surfaceId)) return OBSERVATION.AMBIGUOUS;
  if ((surfaces.stale ?? []).some((item) => item.surfaceId === surfaceId)) return OBSERVATION.AMBIGUOUS;
  return OBSERVATION.UNVERIFIABLE;
}

function verdictToObservation(verdict) {
  if (verdict === "holds") return OBSERVATION.REALIZED;
  if (verdict === "violated") return OBSERVATION.MISSING;
  if (verdict === "cannot_verify" || verdict === "not_checkable") return OBSERVATION.UNVERIFIABLE;
  return null;
}

function conceptObservation(conceptId, commitments) {
  const related = commitments.filter((item) =>
    item.source === conceptId || item.target?.concept === conceptId);
  if (!related.length) return null;
  const observations = related.map((item) => verdictToObservation(item.verdict)).filter(Boolean);
  if (observations.includes(OBSERVATION.MISSING)) return OBSERVATION.MISSING;
  if (observations.includes(OBSERVATION.UNVERIFIABLE)) return OBSERVATION.UNVERIFIABLE;
  if (observations.every((value) => value === OBSERVATION.REALIZED)) return OBSERVATION.REALIZED;
  return OBSERVATION.UNVERIFIABLE;
}

function scenarioObservation(result) {
  if (!result) return OBSERVATION.UNVERIFIABLE;
  if (result === "passed") return OBSERVATION.REALIZED;
  if (result === "failed" || result === "could_not_run") return OBSERVATION.MISSING;
  return OBSERVATION.UNVERIFIABLE;
}

/**
 * Project a human-facing blueprint from an approved/draft Seed plus optional
 * reconciliation report observations. Pure function — no I/O, no persistence.
 */
export function projectBlueprint({ seed = null, report = null } = {}) {
  if (!seed) {
    return {
      empty: true,
      system: null,
      actors: [],
      behaviors: [],
      surfaces: [],
      scenarios: [],
      resources: [],
      unaccounted: [],
      ambiguous: [],
    };
  }

  const commitments = report?.commitments ?? [];
  const surfacesReport = report?.surfaces ?? null;
  const scenarioResults = new Map(
    (report?.scenarios?.results ?? []).map((item) => [item.id, item]),
  );

  const annotate = (items) => items.map((item) => {
    const related = commitments.filter((c) =>
      c.source === item.id || c.target?.concept === item.id);
    const relatedIds = related.flatMap((c) => [c.id, ...(c.claimIds ?? []), ...(c.reasons ?? [])]).map(String);
    return {
      ...item,
      observation: conceptObservation(item.id, commitments),
      commitmentIds: related.map((c) => c.id),
      evidenceIds: [...new Set([item.id, ...relatedIds])],
    };
  });

  const seedSurfaces = [...(seed.surfaces ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const surfaceIds = new Set(seedSurfaces.map((s) => s.id));

  const surfaces = seedSurfaces.map((surface) => ({
    id: surface.id,
    name: surface.name,
    behavior: surface.behavior,
    channel: surface.channel,
    access: surface.access,
    observation: surfaceObservation(surface.id, surfacesReport),
    evidenceIds: [surface.id],
  }));

  // Ambiguous/stale surfaces may reference ids not in the Seed list (adversarial).
  for (const item of [...(surfacesReport?.ambiguous ?? []), ...(surfacesReport?.stale ?? [])]) {
    if (item.surfaceId && !surfaceIds.has(item.surfaceId)) {
      surfaces.push({
        id: item.surfaceId,
        name: item.surfaceName ?? item.surfaceId,
        behavior: null,
        channel: null,
        access: null,
        observation: OBSERVATION.AMBIGUOUS,
        evidenceIds: [item.bindingId ?? item.surfaceId].filter(Boolean),
      });
      surfaceIds.add(item.surfaceId);
    }
  }

  const unaccounted = (surfacesReport?.unaccounted ?? []).map((item) => ({
    elementId: item.elementId ?? null,
    key: item.key ?? item.elementId ?? null,
    name: item.elementName ?? item.key ?? item.elementId ?? "unaccounted surface",
    observation: OBSERVATION.UNACCOUNTED,
    evidenceIds: [item.key ?? item.elementId].filter(Boolean),
  }));

  const ambiguous = [
    ...(surfacesReport?.ambiguous ?? []).map((item) => ({
      surfaceId: item.surfaceId,
      bindingId: item.bindingId ?? null,
      observation: OBSERVATION.AMBIGUOUS,
      evidenceIds: [item.bindingId ?? item.surfaceId].filter(Boolean),
    })),
    ...(surfacesReport?.stale ?? []).map((item) => ({
      surfaceId: item.surfaceId,
      bindingId: null,
      observation: OBSERVATION.AMBIGUOUS,
      evidenceIds: [item.surfaceId],
      reason: item.reason ?? "stale",
    })),
  ];

  const scenarios = [...(seed.scenarios ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map((scenario) => {
    const result = scenarioResults.get(scenario.id);
    return {
      id: scenario.id,
      name: scenario.name,
      principals: scenario.principals ?? [],
      steps: (scenario.steps ?? []).map((step) => ({
        as: step.as,
        invoke: step.invoke,
        expect: step.expect ?? null,
      })),
      observation: scenarioObservation(result?.result),
      result: result?.result ?? null,
      evidenceIds: [scenario.id, ...(result?.reasons ?? [])],
    };
  });

  // Seed v4 (plan §2.1–2.3): state models and flows are projected with their
  // reconciliation observations — declared transitions and member readiness.
  const stateModels = [...(seed.concepts ?? [])]
    .filter((concept) => concept.role === "resource" && concept.stateModel)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((concept) => {
      const checked = (report?.stateModels ?? []).find((section) => section.resourceId === concept.id);
      return {
        resourceId: concept.id,
        resourceName: concept.name,
        initial: concept.stateModel.initial,
        states: [...concept.stateModel.states].sort(),
        transitions: (concept.stateModel.transitions ?? []).map((transition) => {
          const checkedTransition = checked?.transitions.find((item) =>
            item.from === transition.from && item.to === transition.to);
          return {
            from: transition.from,
            to: transition.to,
            via: [...transition.via],
            observation: checkedTransition ? verdictToObservation(checkedTransition.verdict) : OBSERVATION.UNVERIFIABLE,
            evidenceIds: [...(checkedTransition?.claimIds ?? []), ...(checkedTransition?.reasons ?? [])].map(String),
          };
        }),
      };
    });

  const flows = [...(seed.flows ?? [])].sort((a, b) => a.id.localeCompare(b.id)).map((flow) => {
    const projected = (report?.flows ?? []).find((item) => item.id === flow.id);
    return {
      id: flow.id,
      name: flow.name,
      entry: flow.entry,
      members: [...flow.members],
      memberReadiness: (projected?.memberReadiness ?? []).map((item) => ({
        member: item.member,
        holds: item.holds,
        violated: item.violated,
        cannotVerify: item.cannotVerify,
        commitments: item.commitments,
      })),
      observation: projected && projected.memberReadiness?.some((item) => item.violated > 0)
        ? OBSERVATION.MISSING
        : OBSERVATION.REALIZED,
      evidenceIds: [flow.id],
    };
  });

  return {
    empty: false,
    system: seed.system ? { id: seed.system.id, name: seed.system.name } : null,
    actors: annotate(byRole(seed, "actor")),
    behaviors: annotate(byRole(seed, "behavior")),
    resources: annotate(byRole(seed, "resource")),
    surfaces,
    scenarios,
    stateModels,
    flows,
    unaccounted,
    ambiguous,
  };
}

export { OBSERVATION };
