import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { buildSystemModel } from "../../src/system-model/build.js";

const fixture = path.resolve("test/fixtures/system-model-app");
const frontendBefore = path.resolve("test/fixtures/frontend-interaction/before");
const frontendAfter = path.resolve("test/fixtures/frontend-interaction/after");

test("generic fixture populates API, UI, Data, CLI, and Service lenses", async () => {
  const scan = await scanRepo(fixture, { jobs: 1, cache: false });
  const lenses = new Set(scan.model.subsystems.map((item) => item.lens));
  assert.deepEqual([...lenses].sort(), ["api", "cli", "data", "service", "ui"]);
  assert.ok(scan.model.claims.some((item) => item.relation === "produces"));
  assert.ok(scan.model.claims.some((item) => item.relation === "available_when"));
});

function outputContractDraft(withOutput, file = "routes/projects.py") {
  return {
    subsystems: [{ key: "api", lens: "api", name: "API", qualifiers: {}, evidence: [] }],
    elements: [{
      subsystemKey: "api", key: "GET /projects/{slug}/current-job", kind: "operation",
      roles: ["interface", "behavior"], name: "GET /projects/{slug}/current-job", qualifiers: {},
      evidence: [{ file, line: 1 }], observationMethod: "ast", claimState: "observed", capability: "api.operation",
    }],
    claims: withOutput ? [{
      source: { kind: "element", subsystemKey: "api", elementKind: "operation", key: "GET /projects/{slug}/current-job" },
      relation: "produces", target: { kind: "literal", valueType: "contract", value: "CurrentJobResponse" },
      slot: "response", qualifiers: {}, evidence: [{ file, line: 1 }], implementationPath: [{ file, line: 1 }],
      observationMethod: "ast", claimState: "observed", capability: "api.output",
    }] : [],
  };
}

test("backend contract dogfood becomes one added produces claim", () => {
  const before = buildSystemModel(outputContractDraft(false), { systemName: "fixture" });
  const after = buildSystemModel(outputContractDraft(true), { systemName: "fixture" });
  const oldIds = new Set(before.claims.map((item) => item.id));
  const added = after.claims.filter((item) => !oldIds.has(item.id));
  assert.equal(added.length, 1);
  assert.equal(added[0].relation, "produces");
  assert.equal(added[0].target.value, "CurrentJobResponse");
});

test("frontend dogfood becomes one added availability claim", async () => {
  const before = await scanRepo(frontendBefore, { jobs: 1, cache: false });
  const after = await scanRepo(frontendAfter, { jobs: 1, cache: false });
  const oldIds = new Set(before.model.claims.map((item) => item.id));
  const added = after.model.claims.filter((item) => !oldIds.has(item.id));
  assert.deepEqual(added.map((item) => item.relation), ["available_when"]);
});

test("moving behavior evidence does not change model element or claim IDs", () => {
  const a = buildSystemModel(outputContractDraft(true, "a.py"), { systemName: "fixture" });
  const b = buildSystemModel(outputContractDraft(true, "b.py"), { systemName: "fixture" });
  assert.deepEqual(a.elements.map((item) => item.id), b.elements.map((item) => item.id));
  assert.deepEqual(a.claims.map((item) => item.id), b.claims.map((item) => item.id));
  assert.notDeepEqual(a.claims.map((item) => item.evidence), b.claims.map((item) => item.evidence));
});
