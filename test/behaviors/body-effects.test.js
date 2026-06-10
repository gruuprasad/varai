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
