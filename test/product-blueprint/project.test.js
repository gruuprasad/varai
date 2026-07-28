import assert from "node:assert/strict";
import test from "node:test";
import { projectBlueprint } from "../../src/product-blueprint/project.js";

function seedV3() {
  return {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "actor.employee", role: "actor", name: "Employee" },
      { id: "behavior.submit", role: "behavior", name: "Submit request" },
      { id: "resource.request", role: "resource", name: "Purchase request" },
      { id: "condition.pending", role: "condition", name: "Pending" },
    ],
    commitments: [
      { id: "commitment.employee-submits", source: "actor.employee", relation: "performs", target: { concept: "behavior.submit" } },
      { id: "commitment.submit-creates", source: "behavior.submit", relation: "creates", target: { concept: "resource.request" } },
    ],
    surfaces: [
      { id: "surface.submit-api", name: "Submit API", behavior: "behavior.submit", channel: "api", access: "authenticated" },
      { id: "surface.submit-ui", name: "Submit UI", behavior: "behavior.submit", channel: "ui", access: "authenticated" },
    ],
    scenarios: [
      {
        id: "scenario.happy",
        name: "Employee submits",
        principals: [{ as: "requester", actor: "actor.employee" }],
        steps: [{ as: "requester", invoke: "behavior.submit", expect: { status: 201 } }],
      },
    ],
    context: [],
  };
}

test("empty seed yields an empty blueprint projection", () => {
  const blueprint = projectBlueprint({ seed: null });
  assert.equal(blueprint.empty, true);
  assert.deepEqual(blueprint.actors, []);
  assert.deepEqual(blueprint.behaviors, []);
  assert.deepEqual(blueprint.surfaces, []);
  assert.deepEqual(blueprint.scenarios, []);
  assert.deepEqual(blueprint.resources, []);
});

test("blueprint projects actors, behaviors, surfaces, scenarios, and resources from Seed", () => {
  const blueprint = projectBlueprint({ seed: seedV3() });
  assert.equal(blueprint.empty, false);
  assert.equal(blueprint.system.name, "Demo");
  assert.deepEqual(blueprint.actors.map((item) => item.id), ["actor.employee"]);
  assert.deepEqual(blueprint.behaviors.map((item) => item.id), ["behavior.submit"]);
  assert.deepEqual(blueprint.resources.map((item) => item.id), ["resource.request"]);
  assert.equal(blueprint.surfaces.length, 2);
  assert.equal(blueprint.scenarios[0].id, "scenario.happy");
  assert.equal(blueprint.scenarios[0].steps[0].invoke, "behavior.submit");
});

test("observation overlay marks surfaces realized, missing, unaccounted, ambiguous, unverifiable without persisting", () => {
  const report = {
    commitments: [
      { id: "commitment.submit-creates", source: "behavior.submit", verdict: "holds", reasons: [] },
      { id: "commitment.employee-submits", source: "actor.employee", verdict: "cannot_verify", reasons: ["no-binding"] },
    ],
    surfaces: {
      state: "closed",
      accounted: [{ surfaceId: "surface.submit-api", elementId: "el.1" }],
      missing: [{ surfaceId: "surface.submit-ui", reason: "unbound" }],
      unaccounted: [{ elementId: "el.extra", key: "DELETE /api/x", elementName: "DELETE /api/x" }],
      ambiguous: [{ surfaceId: "surface.other", bindingId: "sb.1" }],
      stale: [{ surfaceId: "surface.stale", reason: "artifact-not-found" }],
    },
    scenarios: {
      results: [{ id: "scenario.happy", result: "failed", reasons: ["status-mismatch"] }],
    },
  };

  const blueprint = projectBlueprint({ seed: seedV3(), report });
  assert.equal(blueprint.surfaces.find((s) => s.id === "surface.submit-api").observation, "realized");
  assert.equal(blueprint.surfaces.find((s) => s.id === "surface.submit-ui").observation, "missing");
  assert.equal(blueprint.unaccounted[0].observation, "unaccounted");
  assert.equal(blueprint.unaccounted[0].key, "DELETE /api/x");
  assert.equal(blueprint.surfaces.find((s) => s.id === "surface.other")?.observation ?? "ambiguous", "ambiguous");
  assert.ok(blueprint.ambiguous.some((item) => item.observation === "ambiguous"));
  assert.equal(blueprint.behaviors[0].observation, "realized");
  assert.equal(blueprint.actors[0].observation, "unverifiable");
  assert.equal(blueprint.scenarios[0].observation, "missing");
  assert.equal(blueprint.scenarios[0].result, "failed");
  assert.ok(blueprint.scenarios[0].evidenceIds.includes("scenario.happy"));
  // Projection must not invent a durable overlay graph.
  assert.equal(blueprint.persistedOverlay, undefined);
});

test("without a report, Seed items stay observation-unknown rather than falsely realized", () => {
  const blueprint = projectBlueprint({ seed: seedV3() });
  assert.ok(blueprint.surfaces.every((item) => item.observation === "unverifiable" || item.observation === null));
  assert.ok(blueprint.behaviors.every((item) => item.observation == null || item.observation === "unverifiable"));
});

test("every projected concept and surface carries a stable evidence id even without report matches", () => {
  const blueprint = projectBlueprint({ seed: seedV3() });
  for (const item of [...blueprint.actors, ...blueprint.behaviors, ...blueprint.resources, ...blueprint.surfaces, ...blueprint.scenarios]) {
    assert.ok(item.evidenceIds?.length, `${item.id} must have evidenceIds`);
    assert.ok(item.evidenceIds.includes(item.id), `${item.id} evidence must include its own id`);
  }
});
