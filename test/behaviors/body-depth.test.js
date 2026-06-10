import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { queryTree } from "../../src/scanners/treesitter.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";
import { traceBody } from "../../src/scanners/behaviors/body.js";

async function fnByName(ctx, file, name) {
  const tree = await ctx.tree(file, "python");
  const caps = await queryTree(tree, "python", "(function_definition) @fn");
  return caps.map((c) => c.node).find((n) => n.childForFieldName("name").text === name);
}

test("traceBody recurses into helpers (<=2), collects fails, records untraced", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-depth-"));
  await writeFile(join(dir, "h.py"), `def persist(doc):
    _atomic_json_dump(doc, "f.json")

def update(db):
    if not ok:
        raise HTTPException(status_code=409, detail="conflict")
    persist(doc)
    external_lib_call(doc)
`);
  const ctx = createScanContext(dir);
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };
  const fn = await fnByName(ctx, "h.py", "update");

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.fails.some((f) => f.status === 409));
  assert.ok(out.writes.some((w) => w.medium === "file"), "file write found via helper recursion");
  assert.ok(out.helperCalls.includes("persist"));
  assert.ok(out.untraced.some((u) => u.call === "external_lib_call"));
});
