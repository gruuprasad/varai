import assert from "node:assert/strict";
import test from "node:test";
import { buildVerificationPlan } from "../../src/reconciliation/verification-plan.js";

function seed() {
  return {
    formatVersion: 4,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "actor.owner", role: "actor", name: "Owner" },
      { id: "behavior.create-item", role: "behavior", name: "Create item" },
      { id: "resource.item", role: "resource", name: "Item", fields: [{ name: "name", type: "string", required: true }] },
      { id: "condition.available", role: "condition", name: "Available" },
    ],
    commitments: [
      { id: "commitment.create-item", source: "behavior.create-item", relation: "creates", target: { concept: "resource.item" }, expectation: "present" },
      { id: "commitment.recorded-choice", source: "actor.owner", relation: "performs", target: { concept: "behavior.create-item" }, expectation: "present" },
    ],
    surfaces: [{ id: "surface.create-api", name: "Create API", behavior: "behavior.create-item", channel: "api", access: "public" }],
    scenarios: [{
      id: "scenario.owner-creates",
      name: "Owner creates an item",
      principals: [{ as: "owner", actor: "actor.owner" }],
      steps: [{ id: "create", as: "owner", invoke: "behavior.create-item", input: { name: "one" }, expect: { status: 201 } }],
    }],
    flows: [],
    context: [{ id: "context.quality", text: "The result should be easy to understand." }],
  };
}

test("verification plan classifies every Seed construct without changing authority", () => {
  const plan = buildVerificationPlan({ seed: seed() });
  const byId = new Map(plan.obligations.map((item) => [item.id, item]));

  assert.equal(byId.get("commitment.create-item").method, "deterministic");
  assert.equal(byId.get("commitment.create-item").blocking, true);
  assert.equal(byId.get("commitment.recorded-choice").method, "recorded_only");
  assert.equal(byId.get("surface.create-api").method, "deterministic");
  assert.equal(byId.get("scenario.owner-creates").method, "runtime");
  assert.equal(byId.get("resource.item.name").method, "deterministic");
  assert.equal(byId.get("context.quality").method, "recorded_only");
  assert.deepEqual(plan.summary, {
    total: 6,
    holds: 0,
    violated: 0,
    cannotVerify: 0,
    notCheckable: 0,
    deterministic: 3,
    runtime: 1,
    measurement: 0,
    judgment: 0,
    recorded_only: 2,
  });
});

test("verification plan attaches existing report results without inventing verdicts", () => {
  const report = {
    commitments: [{ id: "commitment.create-item", verdict: "holds", claimIds: ["claim:create"], reasons: [] }],
    surfaces: { accounted: [{ surfaceId: "surface.create-api" }], missing: [], ambiguous: [], stale: [] },
    scenarios: { results: [{ id: "scenario.owner-creates", result: "failed", reasons: ["status-mismatch"] }] },
    fieldContracts: [{ resourceId: "resource.item", fields: [{ name: "name", verdict: "cannot_verify", reasons: ["insufficient-coverage"], claimIds: [] }] }],
  };
  const plan = buildVerificationPlan({ seed: seed(), report });
  const byId = new Map(plan.obligations.map((item) => [item.id, item]));
  assert.equal(byId.get("commitment.create-item").result.verdict, "holds");
  assert.equal(byId.get("surface.create-api").result.verdict, "holds");
  assert.equal(byId.get("scenario.owner-creates").result.verdict, "violated");
  assert.equal(byId.get("resource.item.name").result.verdict, "cannot_verify");
  assert.equal(byId.get("context.quality").result.verdict, "not_checkable");
});
