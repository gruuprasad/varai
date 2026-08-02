import { DEVELOPMENT_ROLES, getDevelopmentRole } from "./definitions.js";

const UI_CAPABILITIES = new Set(["ui.screen", "ui.component", "ui.action", "ui.navigation", "ui.surface", "ui.api-link"]);
const BACKEND_PREFIXES = ["api.", "application.", "data.", "service."];
const ADVISORY_BOUNDARIES = Object.freeze({
  product: ["Does the approved outcome still describe the user's need?", "Are rules and examples precise enough to ratify?"],
  frontend: ["Are visible states and accessibility expectations covered?", "Does the surface remain understandable under failure?"],
  backend: ["Are contracts, state effects, and failures explicit?", "Are authorization and mutation boundaries preserved?"],
  architecture: ["Is the consequential choice necessary and reversible?", "What evidence shows boundary or dependency drift?"],
  "ai-behavior": ["Is the model input/output contract grounded and structured?", "What happens when the provider is uncertain or unavailable?"],
  verification: ["Which obligation has deterministic evidence?", "What remains runtime-only, advisory, or cannot_verify?"]
});

function sorted(items = []) {
  return [...items].sort((a, b) => String(a.id ?? a.key ?? a.name).localeCompare(String(b.id ?? b.key ?? b.name)));
}

function hasPrefix(value, prefixes) {
  return prefixes.some((prefix) => String(value ?? "").startsWith(prefix));
}

function conceptsForRole(seed, roleId) {
  const concepts = seed?.concepts ?? [];
  if (["product", "verification", "architecture"].includes(roleId)) return sorted(concepts);
  if (roleId === "frontend") return sorted(concepts.filter((concept) => ["actor", "behavior", "outcome", "condition"].includes(concept.role)));
  if (roleId === "backend") return sorted(concepts.filter((concept) => ["behavior", "resource", "condition", "outcome"].includes(concept.role)));
  if (roleId === "ai-behavior") return sorted(concepts.filter((concept) => ["behavior", "resource", "condition", "outcome"].includes(concept.role)));
  return sorted(concepts);
}

function relevantConceptIds(seed, roleId) {
  return new Set(conceptsForRole(seed, roleId).map((concept) => concept.id));
}

function commitmentsForRole(seed, roleId, conceptIds) {
  if (["product", "verification"].includes(roleId)) return sorted(seed?.commitments ?? []);
  return sorted((seed?.commitments ?? []).filter((commitment) => {
    const related = conceptIds.has(commitment.source) || conceptIds.has(commitment.target?.concept);
    if (!related) return false;
    if (roleId === "architecture") return commitment.relation === "depends_on" || commitment.relation === "invokes";
    if (roleId === "frontend") return ["invokes", "requires", "fails_with", "produces", "navigates_to"].includes(commitment.relation);
    if (roleId === "ai-behavior") return ["produces", "fails_with", "emits", "requires"].includes(commitment.relation);
    return true;
  }));
}

function surfacesForRole(seed, roleId) {
  const surfaces = seed?.surfaces ?? [];
  if (["product", "verification", "architecture"].includes(roleId)) return sorted(surfaces);
  if (roleId === "frontend") return sorted(surfaces.filter((surface) => surface.channel === "ui"));
  if (roleId === "backend" || roleId === "ai-behavior") return sorted(surfaces.filter((surface) => surface.channel !== "ui"));
  return sorted(surfaces);
}

function scenariosForRole(seed, roleId, conceptIds) {
  if (["product", "verification"].includes(roleId)) return sorted(seed?.scenarios ?? []);
  return sorted((seed?.scenarios ?? []).filter((scenario) => (scenario.steps ?? []).some((step) => conceptIds.has(step.invoke))));
}

function contextForRole(seed, roleId) {
  const context = seed?.context ?? [];
  if (["product", "verification"].includes(roleId)) return sorted(context);
  const words = {
    frontend: /ui|interface|screen|accessib|responsive|interaction|navigation/i,
    backend: /api|state|data|persist|authoriz|failure|transaction|effect/i,
    architecture: /architect|framework|database|dependency|runtime|deploy|boundary|provider/i,
    "ai-behavior": /ai|codex|model|summary|classification|uncertainty|ground|provider|disagreement/i,
  }[roleId];
  return sorted(words ? context.filter((entry) => words.test(entry.text)) : context);
}

function modelElementsForRole(model, roleId) {
  const elements = model?.elements ?? [];
  if (["product", "verification"].includes(roleId)) return sorted(elements);
  if (roleId === "frontend") return sorted(elements.filter((element) => element.subsystemName?.toLowerCase() === "ui" || UI_CAPABILITIES.has(element.capability)));
  if (roleId === "backend") return sorted(elements.filter((element) => hasPrefix(element.capability, BACKEND_PREFIXES)));
  if (roleId === "architecture") return sorted(elements.filter((element) => element.kind === "process" || element.kind === "service" || element.capability === "service.process" || element.capability === "arch.dependency"));
  if (roleId === "ai-behavior") return sorted(elements.filter((element) => /ai|model|codex|summary|classif|claim|prompt/i.test(`${element.name} ${element.key}`) || hasPrefix(element.capability, ["application.", "service."])));
  return sorted(elements);
}

function modelClaimsForRole(model, roleId, elements) {
  const elementIds = new Set(elements.map((element) => element.id));
  const claims = model?.claims ?? [];
  if (["product", "verification"].includes(roleId)) return sorted(claims);
  return sorted(claims.filter((claim) => elementIds.has(claim.sourceId) || elementIds.has(claim.target?.id)
    || (roleId === "frontend" && claim.capability?.startsWith("ui."))
    || (roleId === "architecture" && ["depends_on", "contains", "invokes"].includes(claim.relation))));
}

function coverageForRole(model, roleId, elements) {
  const elementIds = new Set(elements.map((element) => element.id));
  if (["product", "verification"].includes(roleId)) return sorted(model?.coverage ?? []);
  const prefixes = roleId === "frontend" ? ["ui."]
    : roleId === "backend" ? BACKEND_PREFIXES
      : roleId === "architecture" ? ["arch.", "service."]
        : roleId === "ai-behavior" ? ["application.", "service."] : [];
  return sorted((model?.coverage ?? []).filter((record) => elementIds.has(record.scopeId) || hasPrefix(record.capability, prefixes)));
}

function roleEvidence(report, plan, roleId) {
  const allowed = new Set((plan?.obligations ?? [])
    .filter((obligation) => obligation.roles?.includes(roleId))
    .map((obligation) => obligation.id));
  const obligations = (plan?.obligations ?? []).filter((obligation) => allowed.has(obligation.id));
  const commitmentIds = new Set(obligations.filter((item) => item.kind === "commitment").map((item) => item.id));
  const scenarioIds = new Set(obligations.filter((item) => item.kind === "scenario").map((item) => item.id));
  const surfaceIds = new Set(obligations.filter((item) => item.kind === "surface").map((item) => item.id));
  return {
    obligations,
    commitments: (report?.commitments ?? []).filter((item) => commitmentIds.has(item.id)),
    scenarios: (report?.scenarios?.results ?? []).filter((item) => scenarioIds.has(item.id)),
    surfaces: {
      accounted: (report?.surfaces?.accounted ?? []).filter((item) => surfaceIds.has(item.surfaceId)),
      missing: (report?.surfaces?.missing ?? []).filter((item) => surfaceIds.has(item.surfaceId)),
      ambiguous: (report?.surfaces?.ambiguous ?? []).filter((item) => surfaceIds.has(item.surfaceId)),
      stale: (report?.surfaces?.stale ?? []).filter((item) => surfaceIds.has(item.surfaceId)),
    },
  };
}

export function projectDevelopmentRole({ roleId, seed = null, change = null, model = null, report = null, verificationPlan = null } = {}) {
  const definition = getDevelopmentRole(roleId);
  if (!definition) throw new Error(`Unknown development role: ${roleId}`);
  const conceptIds = relevantConceptIds(seed, roleId);
  const elements = modelElementsForRole(model, roleId);
  return {
    role: definition,
    change: change ?? null,
    intent: {
      concepts: conceptsForRole(seed, roleId),
      commitments: commitmentsForRole(seed, roleId, conceptIds),
      surfaces: surfacesForRole(seed, roleId),
      scenarios: scenariosForRole(seed, roleId, conceptIds),
      context: contextForRole(seed, roleId),
      flows: ["product", "verification", "architecture"].includes(roleId) ? sorted(seed?.flows ?? []) : [],
    },
    observed: {
      subsystems: ["product", "verification"].includes(roleId)
        ? sorted(model?.subsystems ?? [])
        : sorted((model?.subsystems ?? []).filter((subsystem) => elements.some((element) => element.subsystemId === subsystem.id))),
      elements,
      claims: modelClaimsForRole(model, roleId, elements),
      coverage: coverageForRole(model, roleId, elements),
      diagnostics: model?.diagnostics ?? [],
    },
    evidence: roleEvidence(report, verificationPlan, roleId),
    advisory: {
      status: "advisory_only",
      verdictAuthority: "deterministic_verifier_and_human",
      questions: ADVISORY_BOUNDARIES[roleId] ?? [],
    },
  };
}

export function recommendDevelopmentRoles({ seed = null, change = null } = {}) {
  const roles = new Set(["product", "verification"]);
  for (const surface of change?.surfaces?.added ?? []) if (surface.channel === "ui") roles.add("frontend");
  for (const surface of change?.surfaces?.changed ?? []) if (surface.after?.channel === "ui") roles.add("frontend");
  for (const commitment of [...(change?.commitments?.added ?? []), ...(change?.commitments?.changed ?? []).map((item) => item.after)]) {
    if (["depends_on", "invokes"].includes(commitment?.relation)) roles.add("architecture");
    if (["produces", "fails_with", "emits"].includes(commitment?.relation)) roles.add("ai-behavior");
    if (["creates", "changes", "removes", "reads", "accepts", "requires"].includes(commitment?.relation)) roles.add("backend");
  }
  if (!seed && roles.size === 2) roles.add("architecture");
  return [...roles].filter((id) => DEVELOPMENT_ROLES[id]);
}
