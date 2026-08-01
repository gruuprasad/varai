import assert from "node:assert/strict";
import test from "node:test";
import { renderBlueprint } from "../../src/ui/blueprint-view.js";

const empty = {
  empty: true,
  actors: [],
  behaviors: [],
  surfaces: [],
  scenarios: [],
  stateModels: [],
  flows: [],
  resources: [],
  unaccounted: [],
  ambiguous: [],
};

const populated = {
  empty: false,
  system: { id: "demo", name: "Demo" },
  actors: [{ id: "actor.employee", name: "Employee", observation: "realized", commitmentIds: ["c1"], evidenceIds: ["c1"] }],
  behaviors: [{ id: "behavior.submit", name: "Submit", observation: "missing", commitmentIds: ["c2"], evidenceIds: ["c2"] }],
  resources: [{ id: "resource.request", name: "Request", observation: null, commitmentIds: [], evidenceIds: [] }],
  surfaces: [
    { id: "surface.submit-api", name: "Submit API", channel: "api", access: "authenticated", observation: "realized", evidenceIds: ["surface.submit-api"] },
    { id: "surface.submit-ui", name: "Submit UI", channel: "ui", access: "authenticated", observation: "missing", evidenceIds: ["surface.submit-ui"] },
  ],
  scenarios: [{
    id: "scenario.happy",
    name: "Happy path",
    observation: "missing",
    result: "failed",
    evidenceIds: ["scenario.happy", "status-mismatch"],
    steps: [{ as: "requester", invoke: "behavior.submit" }],
  }],
  stateModels: [{
    resourceId: "resource.request",
    resourceName: "Request",
    initial: "pending",
    states: ["pending", "approved"],
    transitions: [{ from: "pending", to: "approved", via: ["behavior.submit"], observation: "realized", evidenceIds: ["claim:1"] }],
  }],
  flows: [{
    id: "flow.request-cycle",
    name: "Request cycle",
    entry: "surface.submit-api",
    members: ["behavior.submit"],
    memberReadiness: [{ member: "behavior.submit", commitments: 2, holds: 2, violated: 0, cannotVerify: 0 }],
    observation: "realized",
    evidenceIds: ["flow.request-cycle"],
  }],
  unaccounted: [{ key: "DELETE /x", name: "DELETE /x", observation: "unaccounted", evidenceIds: ["DELETE /x"] }],
  ambiguous: [{ surfaceId: "surface.stale", observation: "ambiguous", evidenceIds: ["surface.stale"] }],
};

test("empty blueprint renders an empty control-room state", () => {
  const html = renderBlueprint(empty);
  assert.match(html, /blueprint-empty|No product blueprint/i);
  assert.doesNotMatch(html, /observation-realized/);
});

test("blueprint renders actors, behaviors, surfaces, scenarios with observation chips and evidence ids", () => {
  const html = renderBlueprint(populated);
  assert.match(html, /Employee/);
  assert.match(html, /Submit API/);
  assert.match(html, /Happy path/);
  assert.match(html, /observation-realized/);
  assert.match(html, /observation-missing/);
  assert.match(html, /observation-unaccounted/);
  assert.match(html, /observation-ambiguous/);
  assert.match(html, /data-evidence-id="surface\.submit-ui"/);
  assert.match(html, /data-evidence-id="scenario\.happy"/);
  assert.match(html, /data-evidence-id="DELETE \/x"/);
});

test("unknown and red observation chips always carry a stable evidence id", () => {
  const html = renderBlueprint({
    ...populated,
    actors: [{ id: "actor.orphan", name: "Orphan", observation: "unverifiable", commitmentIds: [], evidenceIds: ["actor.orphan"] }],
    resources: [{ id: "resource.request", name: "Request", observation: "unknown", commitmentIds: [], evidenceIds: ["resource.request"] }],
  });
  assert.match(html, /observation-unverifiable[^>]*data-evidence-id="actor\.orphan"/);
  assert.match(html, /data-evidence-id="resource\.request"/);
});

test("blueprint escapes XSS in names", () => {
  const html = renderBlueprint({
    empty: false,
    system: { id: "x", name: `<script>alert(1)</script>` },
    actors: [{ id: "actor.a", name: `<img src=x onerror=alert(1)>`, observation: "missing", evidenceIds: ["actor.a"] }],
    behaviors: [],
    resources: [],
    surfaces: [],
    scenarios: [],
    unaccounted: [],
    ambiguous: [],
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;|&lt;img src=x/);
});

test("blueprint renders flows and state models with readiness and transition chips", () => {
  const html = renderBlueprint(populated);
  assert.match(html, /Flows/);
  assert.match(html, /flow\.request-cycle/);
  assert.match(html, /2\/2 hold/);
  assert.match(html, /State models/);
  assert.match(html, /starts pending/);
  assert.match(html, /pending.*→.*approved/s);
});
