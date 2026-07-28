// Making real routes analyzable is only safe if uncertainty stays expensive.
// These run the whole path — scan a real FastAPI tree, reconcile a ratified
// seed — against an adversary who would rather degrade the analysis than fix
// the code. Deleting a required write must be caught; adding one unresolved
// helper must not launder that violation into a calm cannot_verify while
// looking like health.
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { seedContentHash } from "../../src/seed/identity.js";

const FIXTURE = path.resolve("test/fixtures/fastapi-coverage-realistic");
const BOOK = "POST /api/bookings";

const seed = {
  formatVersion: 2,
  system: { id: "realistic", name: "Realistic" },
  context: [],
  concepts: [
    { id: "behavior.book-slot", role: "behavior", name: "Book slot" },
    { id: "resource.booking", role: "resource", name: "Booking" },
  ],
  commitments: [{
    id: "commitment.book-creates-booking",
    source: "behavior.book-slot",
    relation: "creates",
    target: { concept: "resource.booking" },
    expectation: "present",
  }],
};

const realization = {
  formatVersion: 1,
  seedHash: seedContentHash(seed),
  witnesses: [],
  bindings: [
    { id: "binding.book", concept: "behavior.book-slot", artifact: { lens: "api", kind: "operation", key: BOOK } },
    { id: "binding.booking", concept: "resource.booking", artifact: { lens: "data", kind: "entity", key: "Booking" } },
  ],
};

// Each variant is the same application with one adversarial edit applied to the
// route body, scanned from its own tree.
async function variant(edit = (source) => source) {
  const dir = await mkdtemp(join(tmpdir(), "varai-adversary-"));
  await cp(FIXTURE, dir, { recursive: true });
  const mainPath = join(dir, "app", "main.py");
  await writeFile(mainPath, edit(await readFile(mainPath, "utf8")));
  const { model } = await scanRepo(dir, { jobs: 1, cache: false });
  const report = reconcile({ model, seed, realization });
  const operation = model.elements.find((element) => element.kind === "operation" && element.name === BOOK);
  const effect = model.coverage.find((record) =>
    record.capability === "api.effect" && record.scopeId === operation?.id);
  return { report, commitment: report.commitments[0], effect };
}

const withoutBookingWrite = (source) => source
  .replace("    booking = Booking(slot_id=slot.id, member_email=request.member_email)\n", "")
  .replace("    db.add(booking)\n", "")
  .replace("    db.flush()\n", "")
  .replace(
    "    return BookingResponse(id=booking.id, slot_id=booking.slot_id, member_email=booking.member_email)",
    "    return BookingResponse(id=0, slot_id=slot.id, member_email=request.member_email)");

const withUnresolvedHelper = (source) => source
  .replace("    db.commit()\n    return BookingResponse", "    mystery_side_effect(slot)\n    db.commit()\n    return BookingResponse");

test("the intact application holds under analyzed coverage", async () => {
  const { commitment, effect } = await variant();
  assert.equal(effect.state, "analyzed");
  assert.equal(commitment.verdict, "holds");
});

test("deleting the required write is violated, not merely unverified", async () => {
  const { commitment, effect } = await variant(withoutBookingWrite);
  assert.equal(effect.state, "analyzed", "the trace is still complete, so absence is provable");
  assert.equal(commitment.verdict, "violated");
  assert.ok(commitment.reasons.includes("claim-absent-under-analyzed-coverage"));
});

test("one unresolved helper downgrades coverage while the observed write still holds", async () => {
  // Presence does not need complete coverage: the write was seen, so the
  // commitment holds. What the unresolved helper costs is the ability to report
  // absence, and that loss must be recorded rather than absorbed silently.
  const { commitment, effect } = await variant(withUnresolvedHelper);
  assert.equal(effect.state, "partial");
  assert.ok(effect.details.includes("unresolved function"));
  assert.equal(commitment.verdict, "holds");
});

test("under degraded coverage a deleted write can no longer be called violated", async () => {
  // This is the adversary's actual payoff and the reason Gate 3 must treat
  // degradation as a build regression: the same deletion that was violated
  // under a complete trace becomes merely unverifiable once one call is opaque.
  const honest = await variant(withoutBookingWrite);
  const poisoned = await variant((source) => withUnresolvedHelper(withoutBookingWrite(source)));

  assert.equal(honest.commitment.verdict, "violated");
  assert.equal(poisoned.effect.state, "partial");
  assert.equal(poisoned.commitment.verdict, "cannot_verify");
  assert.ok(poisoned.commitment.reasons.includes("insufficient-coverage"));
});

test("degrading the analysis is observable as a change, not silent health", async () => {
  // The adversary's cheapest move against a violation is to make the code
  // harder to analyze. That must be visible as coverage moving backwards from
  // analyzed, so a later gate can treat it as a regression rather than a
  // neutral limitation. Nothing here may look the same as the intact build.
  const intact = await variant();
  const poisoned = await variant((source) => withUnresolvedHelper(withoutBookingWrite(source)));

  assert.equal(intact.effect.state, "analyzed");
  assert.equal(poisoned.effect.state, "partial");
  assert.notEqual(poisoned.effect.state, intact.effect.state);
  assert.notEqual(poisoned.commitment.verdict, "holds",
    "hiding a deleted write behind an unresolved call must never read as holds");
  assert.equal(poisoned.commitment.verdict, "cannot_verify");
});

test("no variant missing the required write ever reads as holds", async () => {
  const missing = [
    withoutBookingWrite,
    (source) => withUnresolvedHelper(withoutBookingWrite(source)),
  ];
  for (const edit of missing) {
    const { commitment } = await variant(edit);
    assert.notEqual(commitment.verdict, "holds");
  }
});
