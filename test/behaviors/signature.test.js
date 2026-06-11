import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { queryTree } from "../../src/scanners/treesitter.js";
import { traceSignature } from "../../src/scanners/behaviors/signature.js";

async function firstFn(dir, file) {
  const ctx = createScanContext(dir);
  const tree = await ctx.tree(file, "python");
  const caps = await queryTree(tree, "python", "(function_definition) @fn");
  return caps[0].node;
}

test("traceSignature extracts gates, request schema, response_model, and config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sig-"));
  await writeFile(join(dir, "auth.py"), `def login(data: LoginRequest, db: Session = Depends(get_db)):
    x = JWT_EXPIRATION_MINUTES
    return data
`);
  const fn = await firstFn(dir, "auth.py");
  const factIndex = {
    schemaNames: new Set(["LoginRequest", "LoginResponse"]),
    modelNames: new Set(["User"]),
    envNames: new Set(["JWT_EXPIRATION_MINUTES"]),
  };
  const out = traceSignature(fn, `@router.post("/login", response_model=LoginResponse)`, "auth.py", factIndex);

  assert.ok(out.requires.some((r) => r.name === "get_db" && r.kind === "dependency"));
  assert.ok(out.requires.some((r) => r.name === "JWT_EXPIRATION_MINUTES" && r.kind === "config"));
  assert.ok(out.takes.some((t) => t.schema === "LoginRequest"));
  assert.ok(out.gives.some((g) => g.schema === "LoginResponse"));
});

test("Annotated[T, Depends(fn)] style gate is detected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sig-ann-"));
  await writeFile(join(dir, "bm.py"), `from typing import Annotated
def get_quantities(ctx: Annotated[JobContext, Depends(get_job_context)]):
    return {}
`);
  const fn = await firstFn(dir, "bm.py");
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = traceSignature(fn, null, "bm.py", factIndex);

  assert.ok(
    out.requires.some((r) => r.name === "get_job_context" && r.kind === "dependency"),
    "Annotated-style Depends gate detected"
  );
});
