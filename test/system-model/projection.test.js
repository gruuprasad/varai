import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createAnalysisIR } from "../../src/ir/canonicalize.js";
import { scanRepo } from "../../src/scanners/index.js";
import { projectAnalysisV2 } from "../../src/system-model/projectors/analysis-v2.js";

const fixture = path.resolve("test/fixtures/system-model-app");
const frontendBefore = path.resolve("test/fixtures/frontend-interaction/before");
const frontendAfter = path.resolve("test/fixtures/frontend-interaction/after");

test("generic fixture populates API, UI, Data, CLI, and Service lenses", async () => {
  const scan = await scanRepo(fixture, { jobs: 1, cache: false });
  const lenses = new Set(scan.systemModel.subsystems.map((item) => item.lens));
  assert.deepEqual([...lenses].sort(), ["api", "cli", "data", "service", "ui"]);
  assert.ok(scan.systemModel.claims.some((item) => item.relation === "produces"));
  assert.ok(scan.systemModel.claims.some((item) => item.relation === "available_when"));
});

function outputContractAnalysis(withOutput, file = "routes/projects.py") {
  return createAnalysisIR({
    scanContext: { activeExtractorIds: ["fastapi.routes.v1"] },
    facts: [{ kind: "api_route", name: "GET /projects/{slug}/current-job", evidence: [{ file, line: 1 }], layer: "ast" }],
    behaviors: [{
      door: { method: "GET", path: "/projects/{slug}/current-job", evidence: [{ file, line: 1 }] },
      requires: [], takes: [], gives: withOutput ? [{ schema: "CurrentJobResponse", evidence: [{ file, line: 1 }], layer: "ast" }] : [],
      reads: [], writes: [], fails: [], untraced: [], guards: [],
    }],
  });
}

test("backend contract dogfood becomes one added produces claim", () => {
  const before = projectAnalysisV2(outputContractAnalysis(false), { systemName: "fixture" });
  const after = projectAnalysisV2(outputContractAnalysis(true), { systemName: "fixture" });
  const oldIds = new Set(before.claims.map((item) => item.id));
  const added = after.claims.filter((item) => !oldIds.has(item.id));
  assert.equal(added.length, 1);
  assert.equal(added[0].relation, "produces");
  assert.equal(added[0].target.value, "CurrentJobResponse");
});

test("frontend dogfood becomes one added availability claim", async () => {
  const before = await scanRepo(frontendBefore, { jobs: 1, cache: false });
  const after = await scanRepo(frontendAfter, { jobs: 1, cache: false });
  const oldIds = new Set(before.systemModel.claims.map((item) => item.id));
  const added = after.systemModel.claims.filter((item) => !oldIds.has(item.id));
  assert.deepEqual(added.map((item) => item.relation), ["available_when"]);
});

test("moving behavior evidence does not change model element or claim IDs", () => {
  const a = projectAnalysisV2(outputContractAnalysis(true, "a.py"), { systemName: "fixture" });
  const b = projectAnalysisV2(outputContractAnalysis(true, "b.py"), { systemName: "fixture" });
  assert.deepEqual(a.elements.map((item) => item.id), b.elements.map((item) => item.id));
  assert.deepEqual(a.claims.map((item) => item.id), b.claims.map((item) => item.id));
  assert.notDeepEqual(a.claims.map((item) => item.evidence), b.claims.map((item) => item.evidence));
});
