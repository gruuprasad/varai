import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { diffSystemModels } from "../../src/system-model/diff.js";

async function scan(source) {
  const root = await mkdtemp(path.join(tmpdir(), "varai-mode-dispatch-"));
  await mkdir(path.join(root, "src/components"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { react: "latest", vite: "latest" } }));
  await writeFile(path.join(root, "src/components/PlanCanvas.tsx"), source);
  return (await scanRepo(root, { jobs: 1, cache: false })).model;
}

const before = `export function PlanCanvas({ tool }) {
  const handleCanvasClick = async () => {
    if (tool === "wall") await apiRequest("/api/walls/preview", { method: "POST" });
  };
  return <Stage onClick={handleCanvasClick} />;
}`;

const after = `export function PlanCanvas({ tool }) {
  const handleCanvasClick = async () => {
    if (tool === "wall") {
      await apiRequest("/api/walls/preview", { method: "POST" });
      await apiRequest("/api/walls", { method: "POST" });
    }
  };
  return <Stage onClick={handleCanvasClick} />;
}`;

test("mode-dispatched canvas continuation reaches the canonical model and semantic diff", async () => {
  const beforeModel = await scan(before);
  const afterModel = await scan(after);
  const action = afterModel.elements.find((item) => item.name === "PlanCanvas Wall on canvas");
  assert.ok(action);

  const claims = afterModel.claims.filter((claim) => claim.sourceId === action.id);
  assert.ok(claims.some((claim) => claim.relation === "available_when" && claim.target.value === 'tool === "wall"'));
  const invocations = claims.filter((claim) => claim.relation === "invokes");
  assert.deepEqual(invocations.map((claim) => claim.target.value).sort(), ["POST /api/walls", "POST /api/walls/preview"]);
  assert.ok(invocations.every((claim) => claim.evidence.length && claim.implementationPath.length));
  assert.ok(afterModel.coverage.some((item) => item.capability === "ui.action" && item.state === "partial"));

  const diff = diffSystemModels(beforeModel, afterModel);
  assert.equal(diff.summary.claimsAdded, 1);
  assert.equal(diff.claims.added[0].relation, "invokes");
  assert.equal(diff.claims.added[0].target.value, "POST /api/walls");
});
