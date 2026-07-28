// Framework mechanics in a handler signature are not calls the handler makes.
// Traversing the whole function node swept `Depends(...)` and `Header(...)` out
// of the parameter list and into the unresolved-call list, which held every real
// FastAPI route at partial coverage. The body is the only thing a body trace
// should read.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { queryTree } from "../../src/scanners/treesitter.js";
import { createResolver } from "../../src/scanners/behaviors/resolver.js";
import { traceBody } from "../../src/scanners/behaviors/body.js";

async function traceNamed(source, name, factIndex = {}) {
  const dir = await mkdtemp(join(tmpdir(), "varai-sigmech-"));
  await writeFile(join(dir, "h.py"), source);
  const ctx = createScanContext(dir);
  const tree = await ctx.tree("h.py", "python");
  const caps = await queryTree(tree, "python", "(function_definition) @fn");
  const fn = caps.map((cap) => cap.node).find((node) => node.childForFieldName("name").text === name);
  const resolver = createResolver(["h.py"], ctx);
  return traceBody(fn, "h.py", ctx, resolver, {
    schemaNames: new Set(), modelNames: new Set(), envNames: new Set(), ...factIndex,
  });
}

const untracedCalls = (out) => out.untraced.map((item) => item.call).sort();

test("Depends and Header in the signature are not unresolved body calls", async () => {
  const out = await traceNamed(`def cancel_booking(
    booking_id: int,
    x_member_email: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    booking = db.get(Booking, booking_id)
    db.commit()
`, "cancel_booking", { modelNames: new Set(["Booking"]) });

  assert.deepEqual(untracedCalls(out), []);
});

test("an annotation constructor in the signature is not an unresolved body call", async () => {
  const out = await traceNamed(`def search(
    limit: int = Query(default=20, le=100),
    cursor: str | None = Cookie(default=None),
    body: dict = Body(default_factory=dict),
):
    return limit
`, "search");

  assert.deepEqual(untracedCalls(out), []);
});

test("a registered model constructor in the body is a known call", async () => {
  const out = await traceNamed(`class Booking:
    pass

def book_slot(db):
    booking = Booking(slot_id=1, member_email="a@b.c")
    db.add(booking)
`, "book_slot", { modelNames: new Set(["Booking"]) });

  assert.deepEqual(untracedCalls(out), []);
  assert.ok(out.writes.some((write) => write.target === "Booking"),
    "the insert is still observed as a write");
});

test("a registered schema constructor in the body is a known call", async () => {
  const out = await traceNamed(`def read_slot(db):
    return SlotView(id=1, label="a")
`, "read_slot", { schemaNames: new Set(["SlotView"]) });

  assert.deepEqual(untracedCalls(out), []);
});

test("an unregistered constructor-shaped call stays unresolved", async () => {
  // Nothing about CapitalCase alone makes a call understood. Only a call that
  // resolves to a declared schema or model is known; a global noise list of
  // plausible-looking names would silently license false absence verdicts.
  const out = await traceNamed(`def book_slot(db):
    booking = Booking(slot_id=1)
    audit = AuditTrail(booking)
    db.add(booking)
`, "book_slot", { modelNames: new Set(["Booking"]) });

  assert.deepEqual(untracedCalls(out), ["AuditTrail"]);
});

test("an unknown body helper keeps the trace incomplete", async () => {
  const out = await traceNamed(`def book_slot(
    request: BookingRequest,
    db: Session = Depends(get_db),
):
    booking = Booking(slot_id=request.slot_id)
    db.add(booking)
    mystery_side_effect(booking)
    db.commit()
`, "book_slot", { modelNames: new Set(["Booking"]), schemaNames: new Set(["BookingRequest"]) });

  assert.deepEqual(untracedCalls(out), ["mystery_side_effect"]);
  assert.equal(out.untraced[0].reason, "unresolved function");
});

test("a call inside a nested function is still attributed to the nested scope", async () => {
  // Restricting the walk to the body must not also stop excluding deeper
  // function scopes: an inner def's calls belong to the inner def.
  const out = await traceNamed(`def outer(db):
    def inner():
        nested_mystery()
    db.commit()
`, "outer");

  assert.deepEqual(untracedCalls(out), []);
});

test("a lambda default in the signature is not a body call", async () => {
  const out = await traceNamed(`def handler(
    now: datetime = Depends(utcnow),
    tag: str = Header(default_factory=make_tag),
):
    return now
`, "handler");

  assert.deepEqual(untracedCalls(out), []);
});
