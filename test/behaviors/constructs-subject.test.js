import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";
import { deriveConstructs } from "../../src/scanners/behaviors/constructs.js";

test("subject label from trunk + return var; jobScoped from {job_id}", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-"));
  await mkdir(join(dir, "bm"), { recursive: true });
  await writeFile(join(dir, "bm/common.py"), `def _ensure_persisted_building_model(ctx):
    document = load(ctx)
    return document
`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["bm/common.py"], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "bm/common.py", line: 1 } },
    trunkCall: "_ensure_persisted_building_model", requires: [], reads: [], writes: [{ medium: "file" }],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "building-model" });
  const bundle = { name: "building-model", behaviors: [
    mk("/api/v1/building-model/{job_id}/quantities"),
    mk("/api/v1/building-model/{job_id}/render"),
  ]};

  await deriveConstructs(bundle, ctx, resolver);

  assert.equal(bundle.jobScoped, true);
  assert.equal(bundle.subject.label, "building-model document");
  assert.equal(bundle.subject.medium, "file");
});
