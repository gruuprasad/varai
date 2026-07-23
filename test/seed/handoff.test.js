import assert from "node:assert/strict";
import test from "node:test";
import { renderBuildPacket } from "../../src/seed/handoff.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { checkRealization } from "../../src/reconciliation/schema.js";
import { slotkeeperDraft } from "./fixtures.js";

function ratifiedSeed() {
  const draft = slotkeeperDraft();
  return { ...draft, ratification: { status: "ratified", contentHash: seedContentHash(draft) } };
}

test("handoff is deterministic for the same ratified seed", () => {
  const seed = ratifiedSeed();
  assert.equal(renderBuildPacket({ seed }), renderBuildPacket({ seed }));
});

test("handoff never includes unratified draft content", () => {
  assert.throws(() => renderBuildPacket({ seed: slotkeeperDraft() }), /unratified/);
  const tampered = { ...ratifiedSeed(), ratification: { status: "ratified", contentHash: "sha256:0".repeat(1).padEnd(71, "0") } };
  assert.throws(() => renderBuildPacket({ seed: tampered }), /re-ratify/);
});

test("handoff carries the seed hash, commitments, and witness schema", () => {
  const seed = ratifiedSeed();
  const packet = renderBuildPacket({ seed, brief: "Use FastAPI and SQLite." });
  assert.ok(packet.includes(seedContentHash(seed)));
  assert.ok(packet.includes("commitment.booking-creates-booking"));
  assert.ok(packet.includes("varai.realization.json"));
  assert.ok(packet.includes("Use FastAPI and SQLite."));
});

test("witness file rejects unknown seed ids", () => {
  const seed = ratifiedSeed();
  const base = {
    formatVersion: 1,
    seedHash: seedContentHash(seed),
    bindings: [{ id: "binding.x", concept: "behavior.missing", artifact: { kind: "operation", key: "POST /x" } }],
    witnesses: [{ commitment: "commitment.missing", sourceBinding: "binding.x" }],
  };
  const codes = checkRealization(base, { seed }).problems.map((problem) => problem.code);
  assert.ok(codes.includes("unknown-concept"));
  assert.ok(codes.includes("unknown-commitment"));
});

test("witness anchors reject line-only identity and bad hashes", () => {
  const seed = ratifiedSeed();
  const doc = {
    formatVersion: 1,
    seedHash: "not-a-hash",
    bindings: [{ id: "binding.x", concept: "behavior.book-slot", artifact: { source: { file: "app.py", line: 3 } } }],
  };
  const codes = checkRealization(doc, { seed }).problems.map((problem) => problem.code);
  assert.ok(codes.includes("invalid-seed-hash"));
  assert.ok(codes.includes("line-only-identity"));
});

test("one concept may bind many artifacts and one binding may serve many commitments", () => {
  const seed = ratifiedSeed();
  const doc = {
    formatVersion: 1,
    seedHash: seedContentHash(seed),
    bindings: [
      { id: "binding.a", concept: "behavior.book-slot", artifact: { kind: "operation", key: "POST /bookings" } },
      { id: "binding.b", concept: "behavior.book-slot", artifact: { kind: "action", key: "Book button" } },
    ],
    witnesses: [
      { commitment: "commitment.booking-creates-booking", sourceBinding: "binding.a", target: { concept: "resource.booking" } },
      { commitment: "commitment.booking-changes-slot", sourceBinding: "binding.a", target: { concept: "resource.slot" } },
    ],
  };
  assert.equal(checkRealization(doc, { seed }).valid, true);
});

test("a witness target must match the seed commitment target", () => {
  const seed = ratifiedSeed();
  const doc = {
    formatVersion: 1,
    seedHash: seedContentHash(seed),
    bindings: [{ id: "binding.a", concept: "behavior.book-slot", artifact: { kind: "operation", key: "POST /bookings" } }],
    witnesses: [{ commitment: "commitment.booking-creates-booking", sourceBinding: "binding.a", target: { concept: "resource.slot" } }],
  };
  const codes = checkRealization(doc, { seed }).problems.map((problem) => problem.code);
  assert.ok(codes.includes("witness-target-mismatch"));
});

test("handoff lists performs as recorded intent, not a checkable relation", () => {
  const packet = renderBuildPacket({ seed: ratifiedSeed() });
  const checkableLine = packet.split("\n").find((l) => l.startsWith("Checkable relations"));
  assert.ok(checkableLine, "packet states the checkable relations");
  assert.ok(!checkableLine.includes("performs"), "performs is not advertised as checkable");
  assert.ok(packet.includes("recorded as intent") && packet.includes("performs"),
    "packet names performs as recorded-only intent");
});
