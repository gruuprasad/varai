// Built-in development responsibilities. These are projections over Varai's
// existing authorities, not a plugin system or a second product model.

export const DEVELOPMENT_ROLE_IDS = Object.freeze([
  "product",
  "frontend",
  "backend",
  "architecture",
  "ai-behavior",
  "verification",
]);

export const DEVELOPMENT_ROLES = Object.freeze({
  product: Object.freeze({
    id: "product",
    label: "Product",
    responsibility: "Capabilities, people, journeys, rules, and outcomes.",
    instruction: "Clarify what the application should do, who it serves, what must remain true, and which user-visible outcomes need examples. Do not choose implementation details unless they change product behavior.",
  }),
  frontend: Object.freeze({
    id: "frontend",
    label: "Frontend",
    responsibility: "User-facing interaction, interface behavior, and accessibility.",
    instruction: "Review the user-facing surfaces, interaction states, loading/empty/failure behavior, accessibility, and responsive expectations. Do not treat hiding a control as authorization.",
  }),
  backend: Object.freeze({
    id: "backend",
    label: "Backend",
    responsibility: "Application operations, contracts, state effects, and failures.",
    instruction: "Review API behavior, validation, persistence, state transitions, effects, failure behavior, and authorization boundaries. Keep mutations explicit and failure-safe.",
  }),
  architecture: Object.freeze({
    id: "architecture",
    label: "Architecture",
    responsibility: "Boundaries, dependencies, reversibility, and consequential technical choices.",
    instruction: "Identify only consequential architectural decisions, compare simple alternatives, preserve reversibility, and flag drift or unnecessary complexity. Do not invent a framework requirement from code alone.",
  }),
  "ai-behavior": Object.freeze({
    id: "ai-behavior",
    label: "AI behavior",
    responsibility: "Model boundaries, structured outputs, grounding, uncertainty, and failure behavior.",
    instruction: "Review AI input/output contracts, grounding, uncertainty, classification boundaries, provider failure, and whether failure can mutate application state. Treat quality judgments as advisory.",
  }),
  verification: Object.freeze({
    id: "verification",
    label: "Verification",
    responsibility: "How approved intent will be checked and what remains uncertain.",
    instruction: "Turn approved intent into bounded checks and adversarial scenarios. Separate deterministic evidence, runtime examples, measurements, human or AI judgment, and cannot_verify. Never promote testimony to proof.",
  }),
});

export function getDevelopmentRole(roleId) {
  return DEVELOPMENT_ROLES[roleId] ?? null;
}
