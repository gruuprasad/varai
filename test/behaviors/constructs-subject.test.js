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

test("subject not derived when trunk doesn't start with a loading verb", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-guard-"));
  const ctx = createScanContext(dir);
  const resolver = createResolver([], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "r.py", line: 1 } },
    trunkCall: "parse_component_type", requires: [], reads: [], writes: [],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "assets" });
  const bundle = { name: "assets", behaviors: [mk("/api/v1/assets/lib/widgets"), mk("/api/v1/assets/lib/panels")] };

  await deriveConstructs(bundle, ctx, resolver);

  assert.equal(bundle.subject, undefined, "parse_ trunk should not produce a subject");
});

test("subject suppressed when label contains -or- (error helper pattern)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-or-"));
  await mkdir(join(dir, "r"), { recursive: true });
  await writeFile(join(dir, "r/common.py"), `def get_project_or_404(slug, db):\n    return db.query(Project).first()\n`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["r/common.py"], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "r/common.py", line: 1 } },
    trunkCall: "get_project_or_404", requires: [], reads: [], writes: [{ medium: "db" }],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "projects" });
  const bundle = { name: "projects", behaviors: [mk("/api/v1/projects/{slug}"), mk("/api/v1/projects/{slug}/export")] };

  await deriveConstructs(bundle, ctx, resolver);

  assert.equal(bundle.subject, undefined, "project-or-404 should not become a subject");
});

test("returnVar not appended when it is a generic path name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-subj-var-"));
  await mkdir(join(dir, "r"), { recursive: true });
  await writeFile(join(dir, "r/common.py"), `def get_model_file(ctx):\n    file_path = compute(ctx)\n    return file_path\n`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["r/common.py"], ctx);
  const mk = (p) => ({ door: { method: "GET", path: p, evidence: { file: "r/common.py", line: 1 } },
    trunkCall: "get_model_file", requires: [], reads: [], writes: [],
    gives: [], takes: [], fails: [], untraced: [], helperCalls: [], bundle: "models" });
  const bundle = { name: "models", behaviors: [mk("/api/v1/models/a"), mk("/api/v1/models/b")] };

  await deriveConstructs(bundle, ctx, resolver);

  assert.ok(bundle.subject, "subject derived");
  assert.ok(!bundle.subject.label.includes("file_path"), `label should not include file_path: got "${bundle.subject?.label}"`);
});
