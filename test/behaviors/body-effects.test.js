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

test("db.add(instance) resolves the instance's declaration as the write subject", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-db4-"));
  await writeFile(join(dir, "h.py"), `class Project:
    pass
def handler(db):
    instance = Project()
    db.add(instance)
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["Project"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  const write = out.writes.find((w) => w.medium === "db" && w.via === "db.add");
  assert.ok(write, "db.add produces a db write");
  assert.equal(write.target, "Project", "value flow resolves the added instance to its declaration");
  assert.ok(!write.mechanism, "a named ORM insert is not suppressed as ceremony");
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

test("underscored mutation helpers prefer their document argument over context", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-document-"));
  await writeFile(join(dir, "h.py"), `class JobContext:
    pass
class BuildingModelDocument:
    pass
def handler(ctx: JobContext):
    document = ensure_document()
    _persist_document(ctx, document)
def ensure_document() -> BuildingModelDocument:
    return BuildingModelDocument()
def _persist_document(ctx: JobContext, document):
    save_document(document)
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.writes.some((item) => item.target === "BuildingModelDocument"),
    "document is the mutation subject");
  assert.ok(!out.writes.some((item) => item.target === "JobContext"),
    "execution context is not the mutation subject");
});

test("db.get(Model, pk) is a read that types the bound variable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-body-get-"));
  await writeFile(join(dir, "h.py"), `class Booking:
    pass
class Slot:
    pass
def cancel(db, booking_id):
    booking = db.get(Booking, booking_id)
    slot = db.get(Slot, booking.slot_id)
    slot.available = True
    db.delete(booking)
    db.commit()
    label = payload.get("label")
`);
  const { fn, ctx } = await fnAndCtx(dir, "h.py");
  const resolver = createResolver(["h.py"], ctx);
  const factIndex = { schemaNames: new Set(), modelNames: new Set(["Booking", "Slot"]), envNames: new Set() };

  const out = await traceBody(fn, "h.py", ctx, resolver, factIndex);

  assert.ok(out.reads.some((item) => item.target === "Booking" && item.via === "db.get"),
    "db.get(Booking, ...) is an entity read");
  assert.ok(out.reads.some((item) => item.target === "Slot" && item.via === "db.get"),
    "db.get(Slot, ...) is an entity read");
  assert.ok(out.writes.some((item) => item.relation === "changes" && item.target === "Slot"),
    "attribute assignment on the get-loaded instance changes the entity");
  assert.ok(out.writes.some((item) => item.relation === "removes" && item.target === "Booking"),
    "db.delete of the get-loaded instance removes the entity");
  assert.ok(!out.reads.some((item) => String(item.via).endsWith("payload.get")),
    "dict .get() stays unclassified");
});
