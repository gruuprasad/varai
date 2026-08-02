// Pure forward verification plan. It explains how approved Seed constructs
// will be checked before a builder runs, then links the same construct to the
// independent result after reconciliation. This is a projection, not a
// second persisted IR and never sets a verdict.

import { relationContract } from "./relations.js";

export const VERIFICATION_METHODS = Object.freeze([
  "deterministic",
  "runtime",
  "measurement",
  "judgment",
  "recorded_only",
]);

const ROLE_BY_CONCEPT_ROLE = Object.freeze({
  actor: ["product"],
  behavior: ["product", "backend"],
  resource: ["backend"],
  condition: ["product", "verification"],
  outcome: ["product", "verification"],
});

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function conceptMap(seed) {
  return new Map((seed?.concepts ?? []).map((concept) => [concept.id, concept]));
}

function rolesForCommitment(commitment, concepts) {
  const roles = new Set([
    ...(ROLE_BY_CONCEPT_ROLE[concepts.get(commitment.source)?.role] ?? []),
    ...(ROLE_BY_CONCEPT_ROLE[commitment.target?.concept !== undefined
      ? concepts.get(commitment.target.concept)?.role
      : null] ?? []),
    "verification",
  ]);
  if (commitment.relation === "depends_on") roles.add("architecture");
  if (commitment.relation === "requires" || commitment.relation === "fails_with") roles.add("frontend");
  if (commitment.relation === "emits") roles.add("ai-behavior");
  return uniqueSorted([...roles]);
}

function relationObligation(commitment, concepts) {
  const contract = relationContract(commitment.relation, {
    literalTarget: commitment.target?.literal !== undefined,
  });
  const method = !contract.checkable ? "recorded_only" : "deterministic";
  return {
    id: commitment.id,
    kind: "commitment",
    title: `${commitment.source} ${commitment.expectation === "absent" ? "must not" : commitment.relation} ${commitment.target?.concept ?? JSON.stringify(commitment.target?.literal)}`,
    roles: rolesForCommitment(commitment, concepts),
    method,
    capabilities: [...contract.capabilities].sort(),
    coverageGrain: contract.coverageGrain,
    blocking: method === "deterministic",
    intent: {
      source: commitment.source,
      relation: commitment.relation,
      target: commitment.target,
      expectation: commitment.expectation ?? "present",
    },
  };
}

function surfaceObligation(surface) {
  return {
    id: surface.id,
    kind: "surface",
    title: surface.name,
    roles: uniqueSorted(["product", surface.channel === "ui" ? "frontend" : "backend", "verification"]),
    method: "deterministic",
    capabilities: ["surface.accounting"],
    coverageGrain: "system",
    blocking: true,
    intent: {
      behavior: surface.behavior,
      channel: surface.channel,
      access: surface.access,
    },
  };
}

function scenarioObligation(scenario) {
  return {
    id: scenario.id,
    kind: "scenario",
    title: scenario.name,
    roles: uniqueSorted(["product", "verification", ...(scenario.steps ?? []).some((step) => step.invoke?.startsWith("behavior.")) ? ["backend"] : []]),
    method: "runtime",
    capabilities: ["runtime.scenario"],
    coverageGrain: "scenario",
    blocking: true,
    intent: {
      principals: scenario.principals ?? [],
      steps: scenario.steps ?? [],
    },
  };
}

function stateModelObligations(seed) {
  return (seed?.concepts ?? [])
    .filter((concept) => concept.role === "resource" && concept.stateModel)
    .flatMap((concept) => (concept.stateModel.transitions ?? []).map((transition) => ({
      id: `${concept.id}:${transition.from}->${transition.to}:${transition.via.join(",")}`,
      kind: "state_transition",
      title: `${concept.name}: ${transition.from} -> ${transition.to}`,
      roles: ["backend", "product", "verification"],
      method: "deterministic",
      capabilities: ["application.state"],
      coverageGrain: "element",
      blocking: true,
      intent: {
        resource: concept.id,
        from: transition.from,
        to: transition.to,
        via: [...transition.via],
      },
    })));
}

function fieldObligations(seed) {
  return (seed?.concepts ?? [])
    .filter((concept) => concept.role === "resource" && Array.isArray(concept.fields))
    .flatMap((concept) => concept.fields.map((field) => ({
      id: `${concept.id}.${field.name}`,
      kind: "field",
      title: `${concept.name}.${field.name}`,
      roles: ["backend", "verification"],
      method: "deterministic",
      capabilities: ["data.contract"],
      coverageGrain: "element",
      blocking: true,
      intent: {
        resource: concept.id,
        field: { ...field },
      },
    })));
}

function contextObligations(seed) {
  return (seed?.context ?? []).map((entry) => ({
    id: entry.id,
    kind: "context",
    title: entry.text,
    roles: ["product"],
    method: "recorded_only",
    capabilities: [],
    coverageGrain: null,
    blocking: false,
    intent: { text: entry.text },
  }));
}

function resultFor(obligation, report) {
  if (!report) return { state: "planned", verdict: null, evidenceIds: [], reasons: [] };
  if (obligation.kind === "commitment") {
    const item = (report.commitments ?? []).find((candidate) => candidate.id === obligation.id);
    return item
      ? { state: "observed", verdict: item.verdict, evidenceIds: [...(item.claimIds ?? []), ...(item.reasons ?? [])], reasons: item.reasons ?? [] }
      : { state: "missing", verdict: null, evidenceIds: [], reasons: ["missing-report-item"] };
  }
  if (obligation.kind === "surface") {
    const surface = report.surfaces ?? {};
    const item = [...(surface.accounted ?? []), ...(surface.missing ?? []), ...(surface.ambiguous ?? []), ...(surface.stale ?? [])]
      .find((candidate) => candidate.surfaceId === obligation.id);
    if (!item) return { state: "cannot_verify", verdict: "cannot_verify", evidenceIds: [], reasons: ["surface-not-reported"] };
    if (surface.accounted?.includes(item)) return { state: "observed", verdict: "holds", evidenceIds: [obligation.id], reasons: [] };
    return { state: "observed", verdict: "cannot_verify", evidenceIds: [obligation.id], reasons: [item.reason ?? "surface-not-accounted"] };
  }
  if (obligation.kind === "scenario") {
    const item = (report.scenarios?.results ?? []).find((candidate) => candidate.id === obligation.id);
    if (!item) return { state: "planned", verdict: null, evidenceIds: [], reasons: ["scenario-not-run"] };
    const verdict = item.result === "passed" ? "holds" : item.result === "failed" ? "violated" : "cannot_verify";
    return { state: "observed", verdict, evidenceIds: [obligation.id, ...(item.reasons ?? [])], reasons: item.reasons ?? [] };
  }
  if (obligation.kind === "state_transition") {
    const [resourceId, transition] = obligation.id.split(":");
    const [from, to] = (transition ?? "").split("->");
    const item = (report.stateModels ?? []).find((section) => section.resourceId === resourceId)?.transitions
      ?.find((candidate) => candidate.from === from && candidate.to === to);
    return item
      ? { state: "observed", verdict: item.verdict, evidenceIds: [...(item.claimIds ?? []), ...(item.reasons ?? [])], reasons: item.reasons ?? [] }
      : { state: "planned", verdict: null, evidenceIds: [], reasons: ["transition-not-reported"] };
  }
  if (obligation.kind === "field") {
    const [resourceId, fieldName] = obligation.id.split(/\.(?=[^.]+$)/);
    const item = (report.fieldContracts ?? []).find((section) => section.resourceId === resourceId)?.fields
      ?.find((candidate) => candidate.name === fieldName);
    return item
      ? { state: "observed", verdict: item.verdict, evidenceIds: [...(item.claimIds ?? []), ...(item.reasons ?? [])], reasons: item.reasons ?? [] }
      : { state: "planned", verdict: null, evidenceIds: [], reasons: ["field-not-reported"] };
  }
  return { state: "recorded", verdict: "not_checkable", evidenceIds: [obligation.id], reasons: ["recorded-only"] };
}

export function buildVerificationPlan({ seed, report = null } = {}) {
  if (!seed) return { formatVersion: 1, obligations: [], summary: emptySummary() };
  const concepts = conceptMap(seed);
  const obligations = [
    ...(seed.commitments ?? []).map((item) => relationObligation(item, concepts)),
    ...(seed.surfaces ?? []).map(surfaceObligation),
    ...(seed.scenarios ?? []).map(scenarioObligation),
    ...stateModelObligations(seed),
    ...fieldObligations(seed),
    ...contextObligations(seed),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const withResults = obligations.map((obligation) => ({
    ...obligation,
    result: resultFor(obligation, report),
  }));
  const summary = withResults.reduce((acc, item) => {
    acc.total += 1;
    acc[item.method] = (acc[item.method] ?? 0) + 1;
    if (item.result.verdict === "holds") acc.holds += 1;
    else if (item.result.verdict === "violated") acc.violated += 1;
    else if (item.result.verdict === "cannot_verify") acc.cannotVerify += 1;
    else if (item.result.verdict === "not_checkable") acc.notCheckable += 1;
    return acc;
  }, emptySummary());
  return { formatVersion: 1, obligations: withResults, summary };
}

function emptySummary() {
  return {
    total: 0,
    holds: 0,
    violated: 0,
    cannotVerify: 0,
    notCheckable: 0,
    deterministic: 0,
    runtime: 0,
    measurement: 0,
    judgment: 0,
    recorded_only: 0,
  };
}
