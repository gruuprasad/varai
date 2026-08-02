import assert from "node:assert/strict";
import test from "node:test";
import { DEVELOPMENT_ROLE_IDS } from "../../src/development-roles/definitions.js";
import { projectDevelopmentRole, recommendDevelopmentRoles } from "../../src/development-roles/project.js";

const seed = {
  formatVersion: 4,
  system: { id: "demo", name: "Demo" },
  concepts: [
    { id: "actor.reader", role: "actor", name: "Reader" },
    { id: "behavior.view-feed", role: "behavior", name: "View feed" },
    { id: "resource.claim", role: "resource", name: "Claim" },
    { id: "outcome.conflict", role: "outcome", name: "Conflict" },
  ],
  commitments: [
    { id: "commitment.feed-reads-claims", source: "behavior.view-feed", relation: "reads", target: { concept: "resource.claim" }, expectation: "present" },
    { id: "commitment.feed-produces-conflict", source: "behavior.view-feed", relation: "produces", target: { concept: "outcome.conflict" }, expectation: "present" },
  ],
  surfaces: [
    { id: "surface.feed-ui", name: "Feed UI", behavior: "behavior.view-feed", channel: "ui", access: "public" },
    { id: "surface.feed-api", name: "Feed API", behavior: "behavior.view-feed", channel: "api", access: "public" },
  ],
  scenarios: [{ id: "scenario.reader-sees-feed", name: "Reader sees feed", principals: [], steps: [{ id: "view", as: "reader", invoke: "behavior.view-feed", expect: { status: 200 } }] }],
  flows: [],
  context: [{ id: "context.ai-summary", text: "AI summary preserves disagreement and uncertainty." }],
};

const model = {
  subsystems: [
    { id: "subsystem:ui", lens: "ui", name: "UI" },
    { id: "subsystem:api", lens: "api", name: "API" },
    { id: "subsystem:data", lens: "data", name: "Data" },
  ],
  elements: [
    { id: "element:screen", capability: "ui.screen", subsystemId: "subsystem:ui", subsystemName: "UI", kind: "screen", name: "Feed" },
    { id: "element:route", capability: "api.operation", subsystemId: "subsystem:api", subsystemName: "API", kind: "operation", name: "GET /feed" },
    { id: "element:claim", capability: "data.entity", subsystemId: "subsystem:data", subsystemName: "Data", kind: "entity", name: "Claim" },
  ],
  claims: [{ id: "claim:feed-output", capability: "api.output", sourceId: "element:route", relation: "produces", target: { id: "element:claim" } }],
  coverage: [{ id: "coverage:ui", capability: "ui.screen", scopeId: "subsystem:ui", state: "partial" }],
  diagnostics: [],
};

test("every built-in role projects the same authorities without mutation", () => {
  for (const roleId of DEVELOPMENT_ROLE_IDS) {
    const projection = projectDevelopmentRole({ roleId, seed, model, verificationPlan: { obligations: [] } });
    assert.equal(projection.role.id, roleId);
    assert.ok(Array.isArray(projection.intent.concepts));
    assert.ok(Array.isArray(projection.observed.elements));
    assert.ok(Array.isArray(projection.evidence.obligations));
    assert.equal(projection.advisory.status, "advisory_only");
    assert.equal(projection.advisory.verdictAuthority, "deterministic_verifier_and_human");
  }
  assert.equal(seed.context.length, 1);
  assert.equal(model.elements.length, 3);
});

test("frontend and backend projections select their relevant implementation evidence", () => {
  const frontend = projectDevelopmentRole({ roleId: "frontend", seed, model });
  const backend = projectDevelopmentRole({ roleId: "backend", seed, model });
  assert.deepEqual(frontend.observed.elements.map((item) => item.id), ["element:screen"]);
  assert.deepEqual(backend.observed.elements.map((item) => item.id), ["element:claim", "element:route"]);
  assert.deepEqual(frontend.intent.surfaces.map((item) => item.id), ["surface.feed-ui"]);
  assert.deepEqual(backend.intent.surfaces.map((item) => item.id), ["surface.feed-api"]);
});

test("role recommendations keep product and verification in every change", () => {
  const roles = recommendDevelopmentRoles({
    seed,
    change: {
      surfaces: { added: [{ channel: "ui" }], changed: [] },
      commitments: { added: [{ relation: "depends_on" }], changed: [] },
    },
  });
  assert.deepEqual(roles, ["product", "verification", "frontend", "architecture"]);
});
