import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { queryTree } from "../../src/scanners/treesitter.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";
import { traceBody } from "../../src/scanners/behaviors/body.js";

async function fnAndCtx(dir, file) {
  const ctx = createScanContext(dir);
  const tree = await ctx.tree(file, "python");
  const caps = await queryTree(tree, "python", "(function_definition) @fn");
  return { fn: caps[0].node, ctx };
}

test("traceBody detects db reads/writes and file writes at depth 0", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-"));
  await writeFile(join(dir, "h.py"), `def render(db):
    project = db.query(Project).first()
    artifact = ProjectArtifact()
    db.add(artifact)
    db.commit()
    _atomic_json_dump(doc, "out.glb")
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["Project", "ProjectArtifact"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.reads.some((r) => r.target === "Project" && r.medium === "db"));
  assert.ok(out.writes.some((w) => w.via === "db.commit" && w.medium === "db"));
  assert.ok(out.writes.some((w) => w.medium === "file"));
});

test("db.add() on non-identifier receiver is ignored (no false db write)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-db1-"));
  await writeFile(join(dir, "h.py"), `def handler():
    artifact_map.setdefault(str(pid), set()).add(atype)
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.equal(out.writes.filter((w) => w.medium === "db").length, 0, "no db write for chained .add()");
});

test("db.add(Model()) captures model name; db.commit() target is null", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-db2-"));
  await writeFile(join(dir, "h.py"), `def handler(db):
    db.add(JobOwnership(job_id=job_id))
    db.add(project)
    db.commit()
    db.commit()
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["JobOwnership", "Project"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  const dbWrites = out.writes.filter((w) => w.medium === "db");
  assert.ok(dbWrites.some((w) => w.target === "JobOwnership"), "constructor arg extracted");
  assert.ok(dbWrites.every((w) => w.target !== "db"), "receiver name not used as target");
  assert.ok(dbWrites.some((w) => w.via === "db.commit" && w.target === null), "commit has null target");
});

test("chained db.query(X).filter().delete() extracts X as write target", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-db3-"));
  await writeFile(join(dir, "h.py"), `def handler(db):
    db.query(JobOwnership).filter(JobOwnership.project_id == project.id).delete()
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["JobOwnership"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.writes.some((w) => w.target === "JobOwnership" && w.medium === "db"),
    "chained delete target extracted");
});
