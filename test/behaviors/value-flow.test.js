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

const REAL_SHAPE = `class JobContext:
    pass
class BuildingModelDocument:
    pass
def route(ctx: JobContext):
    document = ensure_document(ctx)
    return perform(ctx, document, update_structural_type)
def ensure_document(ctx):
    return BuildingModelDocument()
def perform(ctx, document, operation):
    def callback(current_document):
        return operation(current_document)
    return run_operation(ctx, document, callback)
def run_operation(ctx, document, callback):
    return callback(document)
def update_structural_type(document):
    document.update()
    return document
`;

test("value flow reaches the aggregate through unannotated wrapper, callable value, and closure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-vf-real-"));
  await writeFile(join(dir, "h.py"), REAL_SHAPE);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.writes.some((item) => item.target === "BuildingModelDocument"),
    "aggregate is the mutation subject through the callable/closure chain");
  assert.ok(!out.writes.some((item) => item.target === "JobContext"),
    "execution context is not the mutation subject");
});

test("renaming and splitting private wrappers changes evidence only, not the subject", async () => {
  const renamed = `class JobContext:
    pass
class BuildingModelDocument:
    pass
def route(ctx: JobContext):
    document = _load_doc(ctx)
    return _apply(ctx, document, update_structural_type)
def _load_doc(ctx):
    return _construct()
def _construct():
    return BuildingModelDocument()
def _apply(ctx, document, operation):
    def run(current):
        return operation(current)
    return _dispatch(document, run)
def _dispatch(document, cb):
    return cb(document)
def update_structural_type(document):
    document.update()
    return document
`;
  const dir = await mkdtemp(join(tmpdir(), "varai-vf-renamed-"));
  await writeFile(join(dir, "h.py"), renamed);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.writes.some((item) => item.target === "BuildingModelDocument"),
    "subject survives helper rename/split refactor");
});

test("a conditional with one known and one unresolved branch stays ambiguous", async () => {
  const mixed = `class BuildingModelDocument:
    pass
def route(ctx, flag, external_op):
    document = ensure_document(ctx)
    operation = update_a if flag else external_op
    return perform(document, operation)
def ensure_document(ctx):
    return BuildingModelDocument()
def perform(document, operation):
    return operation(document)
def update_a(document):
    document.update()
    return document
`;
  const dir = await mkdtemp(join(tmpdir(), "varai-vf-mixed-"));
  await writeFile(join(dir, "h.py"), mixed);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.untraced.some((item) => /callable|ambiguous/i.test(item.reason ?? "")),
    "one known plus one unresolved branch is ambiguous, not silently resolved to the known branch");
});

test("a higher-order wrapper invoked with different captured operations does not collide in memo", async () => {
  const collide = `class Alpha:
    pass
class Beta:
    pass
def route(seed):
    a = apply_wrapper(seed, make_wrapper(to_alpha))
    b = apply_wrapper(seed, make_wrapper(to_beta))
    persist_a(a)
    persist_b(b)
def to_alpha(x):
    return Alpha()
def to_beta(x):
    return Beta()
def make_wrapper(convert):
    def wrapper(v):
        return convert(v)
    return wrapper
def apply_wrapper(value, fn):
    return fn(value)
def persist_a(document):
    document.update()
def persist_b(document):
    document.update()
`;
  const dir = await mkdtemp(join(tmpdir(), "varai-vf-collide-"));
  await writeFile(join(dir, "h.py"), collide);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  const targets = out.writes.map((item) => item.target);
  assert.ok(targets.includes("Alpha"), "first captured conversion resolves to Alpha");
  assert.ok(targets.includes("Beta"),
    "second captured conversion resolves to Beta rather than reusing the first wrapper's memo");
});

test("ambiguous callable flow yields a diagnostic and invents no subject", async () => {
  const ambiguous = `class JobContext:
    pass
class BuildingModelDocument:
    pass
def route(ctx: JobContext, flag):
    document = ensure_document(ctx)
    operation = update_a if flag else update_b
    return perform(ctx, document, operation)
def ensure_document(ctx):
    return BuildingModelDocument()
def perform(ctx, document, operation):
    return operation(document)
def update_a(document):
    document.update()
    return document
def update_b(document):
    document.update()
    return document
`;
  const dir = await mkdtemp(join(tmpdir(), "varai-vf-ambiguous-"));
  await writeFile(join(dir, "h.py"), ambiguous);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.untraced.some((item) => /callable|ambiguous/i.test(item.reason ?? "")),
    "ambiguous callable target is reported as untraced");
});
