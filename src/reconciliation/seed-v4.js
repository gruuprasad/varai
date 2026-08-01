// Seed v4 reconciliation (plan §2.1–2.3, §4.3): declared state-model
// transitions and field contracts checked against canonical Claims under the
// Gate 2 capabilities, plus the flows grouping projection. Pure and
// deterministic; consumes only ratified seed + System Model + bindings.

const STRONG_STATES = new Set(["observed", "inferred"]);

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function byId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function coverageFor(model, capability, elementIds) {
  return (model.coverage ?? [])
    .filter((record) => record.capability === capability && elementIds.includes(record.scopeId))
    .map((record) => ({
      capability: record.capability,
      scopeId: record.scopeId,
      state: record.state,
      ...(record.analyzerVersion != null ? { analyzerVersion: record.analyzerVersion } : {}),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

// A declared transition holds only with recognizable from-state/path evidence:
// a literal target-state claim whose state_from qualifier names the declared
// `from` (plan §2.1). A bare target assignment never proves the transition.
function checkTransition(model, transition, elementIds, resourceId) {
  const claims = (model.claims ?? [])
    .filter((claim) => claim.capability === "application.state"
      && elementIds.includes(claim.sourceId)
      && claim.target?.kind === "literal"
      && claim.target.value === transition.to
      && claim.qualifiers?.state_from === transition.from)
    .sort(byId);
  const strong = claims.filter((claim) => STRONG_STATES.has(claim.claimState));
  const coverage = coverageFor(model, "application.state", elementIds);
  const analyzedScopes = new Set(coverage.filter((record) => record.state === "analyzed").map((record) => record.scopeId));
  const allAnalyzed = elementIds.length > 0 && elementIds.every((id) => analyzedScopes.has(id));

  if (strong.length) {
    return {
      from: transition.from,
      to: transition.to,
      via: [...transition.via],
      verdict: "holds",
      reasons: [],
      claimIds: strong.map((claim) => claim.id),
      evidence: strong.flatMap((claim) => claim.evidence ?? []),
      coverage,
    };
  }
  if (claims.length) {
    return {
      from: transition.from,
      to: transition.to,
      via: [...transition.via],
      verdict: "cannot_verify",
      reasons: ["claim-not-confirmed"],
      claimIds: claims.map((claim) => claim.id),
      evidence: claims.flatMap((claim) => claim.evidence ?? []),
      coverage,
    };
  }
  return {
    from: transition.from,
    to: transition.to,
    via: [...transition.via],
    verdict: allAnalyzed ? "violated" : "cannot_verify",
    reasons: [allAnalyzed ? "transition-absent-under-analyzed-coverage" : "insufficient-coverage"],
    claimIds: [],
    evidence: [],
    coverage,
  };
}

export function checkStateModels({ model, seed, bindingsByConcept, resolution }) {
  const resources = (seed.concepts ?? [])
    .filter((concept) => concept.role === "resource" && concept.stateModel)
    .sort(byId);
  const sections = [];
  for (const resource of resources) {
    const modelState = resource.stateModel;
    const records = (bindingsByConcept.get(resource.id) ?? [])
      .map((binding) => resolution.get(binding.id) ?? { id: binding.id, state: "stale", reason: "unknown-binding", elementIds: [] });
    const elementIds = uniqueSorted(records.flatMap((record) => record.elementIds));
    const transitions = [...(modelState.transitions ?? [])]
      .sort((a, b) => `${a.from} ${a.to}`.localeCompare(`${b.from} ${b.to}`))
      .map((transition) => {
        const viaBindings = (transition.via ?? []).flatMap((behaviorId) => {
          const behavior = (seed.concepts ?? []).find((concept) => concept.id === behaviorId);
          if (!behavior) return [];
          const behaviorRecords = (bindingsByConcept.get(behaviorId) ?? [])
            .map((binding) => resolution.get(binding.id) ?? { id: binding.id, state: "stale", reason: "unknown-binding", elementIds: [] });
          return uniqueSorted(behaviorRecords.flatMap((record) => record.elementIds));
        });
        return checkTransition(model, transition, viaBindings, resource.id);
      });
    sections.push({
      resourceId: resource.id,
      resourceName: resource.name,
      initial: modelState.initial,
      states: [...modelState.states].sort(),
      transitions,
    });
  }
  return sections;
}


const TYPE_COMPAT = {
  string: ["string"],
  integer: ["integer"],
  number: ["number", "integer"],
  boolean: ["boolean"],
  datetime: ["datetime", "date", "time"],
  date: ["date", "datetime"],
  time: ["time"],
  uuid: ["uuid"],
  object: ["object"],
  array: ["array"],
};

function typeCompatible(declared, observed) {
  const observedNormalized = String(observed ?? "").toLowerCase();
  return (TYPE_COMPAT[declared] ?? [declared]).includes(observedNormalized);
}

// Declared fields must be covered by observed has_field claims; type and
// requiredness qualifiers are checked only where syntax proves them.
function checkField(model, resourceId, field, elementIds) {
  const claims = (model.claims ?? [])
    .filter((claim) => claim.capability === "data.contract"
      && claim.relation === "has_field"
      && elementIds.includes(claim.sourceId)
      && claim.target?.kind === "literal"
      && claim.target.value === field.name)
    .sort(byId);
  const strong = claims.filter((claim) => STRONG_STATES.has(claim.claimState));
  const coverage = coverageFor(model, "data.contract", elementIds);
  const analyzedScopes = new Set(coverage.filter((record) => record.state === "analyzed").map((record) => record.scopeId));
  const allAnalyzed = elementIds.length > 0 && elementIds.every((id) => analyzedScopes.has(id));

  const problems = [];
  if (strong.length) {
    const qualifiers = strong[0].qualifiers ?? {};
    if (qualifiers.type !== undefined && !typeCompatible(field.type, qualifiers.type)) {
      problems.push({ code: "field-type-mismatch", message: `${resourceId}.${field.name} declared ${field.type}, observed ${qualifiers.type}` });
    }
    if (field.required === true && qualifiers.required === false) {
      problems.push({ code: "field-requiredness-mismatch", message: `${resourceId}.${field.name} declared required, observed optional` });
    }
  }

  const verdict = strong.length
    ? (problems.length ? "violated" : "holds")
    : claims.length
      ? "cannot_verify"
      : allAnalyzed
        ? "violated"
        : "cannot_verify";

  return {
    name: field.name,
    declared: { type: field.type, required: field.required ?? true },
    verdict,
    reasons: problems.map((problem) => problem.code),
    claimIds: strong.length ? strong.map((claim) => claim.id) : claims.map((claim) => claim.id),
    coverage,
  };
}

export function checkFieldContracts({ model, seed, bindingsByConcept, resolution }) {
  const resources = (seed.concepts ?? [])
    .filter((concept) => concept.role === "resource" && Array.isArray(concept.fields) && concept.fields.length)
    .sort(byId);
  return resources.map((resource) => {
    const records = (bindingsByConcept.get(resource.id) ?? [])
      .map((binding) => resolution.get(binding.id) ?? { id: binding.id, state: "stale", reason: "unknown-binding", elementIds: [] });
    const elementIds = uniqueSorted(records.flatMap((record) => record.elementIds));
    return {
      resourceId: resource.id,
      resourceName: resource.name,
      fields: [...resource.fields]
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map((field) => checkField(model, resource.id, field, elementIds)),
    };
  });
}

// Flows are a review-at-the-right-altitude projection: per-flow member
// readiness from the commitment verdicts already computed. No new verdicts.
export function projectFlows({ seed, commitments }) {
  return [...(seed.flows ?? [])]
    .sort(byId)
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      entry: flow.entry,
      members: [...flow.members],
      memberReadiness: flow.members.map((member) => {
        const items = (commitments ?? []).filter((item) => item.source === member);
        return {
          member,
          commitments: items.length,
          holds: items.filter((item) => item.verdict === "holds").length,
          violated: items.filter((item) => item.verdict === "violated").length,
          cannotVerify: items.filter((item) => item.verdict === "cannot_verify").length,
        };
      }),
    }));
}
