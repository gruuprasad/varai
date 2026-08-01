import assert from "node:assert/strict";
import test from "node:test";
import { renderBuildPacket, renderBuildPacketJson, carryForwardCandidates } from "../../src/seed/handoff.js";
import { diffSeeds } from "../../src/seed/diff.js";
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
  assert.throws(() => renderBuildPacket({ seed: slotkeeperDraft() }), /not approved/);
  const tampered = { ...ratifiedSeed(), ratification: { status: "ratified", contentHash: "sha256:0".repeat(1).padEnd(71, "0") } };
  assert.throws(() => renderBuildPacket({ seed: tampered }), /approve it again/);
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

test("handoff documents realization v2 surfaceBindings", () => {
  const packet = renderBuildPacket({ seed: ratifiedSeed() });
  assert.ok(packet.includes('"formatVersion": 2'), "builder map uses realization format 2");
  assert.ok(packet.includes("surfaceBindings"), "builder map documents surfaceBindings");
  assert.ok(packet.includes("surface-binding."), "surface binding id pattern is shown");
});

test("handoff documents bounded product scenarios when present", () => {
  const draft = {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "actor.employee", role: "actor", name: "Employee" },
      { id: "behavior.submit-request", role: "behavior", name: "Submit" },
    ],
    commitments: [],
    surfaces: [],
    scenarios: [{
      id: "scenario.owner-can-submit",
      name: "Owner can submit",
      principals: [{ as: "owner", actor: "actor.employee" }],
      steps: [{
        id: "submit",
        as: "owner",
        invoke: "behavior.submit-request",
        expect: { status: 201 },
      }],
    }],
    context: [],
  };
  const seed = { ...draft, ratification: { status: "ratified", contentHash: seedContentHash(draft) } };
  const packet = renderBuildPacket({ seed });
  assert.ok(packet.includes("## Product scenarios"), "packet has a scenarios section");
  assert.ok(packet.includes("scenario.owner-can-submit"), "packet lists scenario ids");
  assert.ok(packet.includes("$capture.path"), "packet documents capture refs");
  assert.ok(packet.includes("concurrency"), "packet states concurrency is out of language");
  assert.ok(packet.includes("examples, not invariants"), "packet frames scenarios as examples");
});

test("handoff --json without a prior ready session reports an explicit no-baseline state", () => {
  const seed = ratifiedSeed();
  const packet = renderBuildPacketJson({ seed });
  assert.equal(packet.baseline.present, false);
  assert.equal(packet.changes, null);
  assert.equal(packet.carryForwardCandidates.present, false);
  assert.deepEqual(packet.carryForwardCandidates.bindings, []);
  assert.equal(packet.packet, renderBuildPacket({ seed }));
});

test("handoff --json carries the full seed diff against the prior ready session", () => {
  const baselineSeed = ratifiedSeed();
  const changed = {
    ...baselineSeed,
    commitments: [
      ...baselineSeed.commitments,
      { id: "commitment.new-requirement", source: "behavior.book-slot", relation: "requires", target: { literal: "slot is available" } },
    ],
  };
  changed.ratification = { status: "ratified", contentHash: seedContentHash(changed) };
  const packet = renderBuildPacketJson({
    seed: changed,
    baseline: { sessionId: "build:prior", seed: baselineSeed, realization: null },
  });
  assert.equal(packet.baseline.present, true);
  assert.equal(packet.baseline.sessionId, "build:prior");
  assert.equal(packet.changes.commitments.added.length, 1);
  assert.equal(packet.changes.commitments.added[0].id, "commitment.new-requirement");
  assert.equal(packet.changes.commitments.removed.length, 0);
  assert.equal(packet.changes.commitments.changed.length, 0);
});

test("carry-forward candidates require unchanged seed definitions", () => {
  const baselineSeed = ratifiedSeed();
  const realization = {
    formatVersion: 2,
    seedHash: seedContentHash(baselineSeed),
    bindings: [
      { id: "binding.book", concept: "behavior.book-slot", artifact: { kind: "operation", key: "POST /bookings" } },
      { id: "binding.stale-concept", concept: "behavior.removed", artifact: { kind: "operation", key: "POST /x" } },
    ],
    surfaceBindings: [],
    witnesses: [],
  };
  const unchanged = { ...baselineSeed, ratification: { status: "ratified", contentHash: seedContentHash(baselineSeed) } };
  const removedConceptSeed = {
    ...baselineSeed,
    concepts: baselineSeed.concepts.filter((concept) => concept.id !== "behavior.removed"),
  };
  // The stale binding's concept never existed in the baseline seed; drop it to
  // keep the baseline valid, and instead test a *changed* concept.
  const changedConcept = { ...baselineSeed.concepts.find((c) => c.id === "behavior.book-slot"), summary: "edited summary" };
  const changedSeed = {
    ...baselineSeed,
    concepts: baselineSeed.concepts.map((concept) => concept.id === "behavior.book-slot" ? changedConcept : concept),
  };
  const changedRatified = { ...changedSeed, ratification: { status: "ratified", contentHash: seedContentHash(changedSeed) } };

  const candidates = carryForwardCandidates({
    baselineSeed,
    baselineRealization: realization,
    currentSeed: changedRatified,
    changes: diffSeeds(baselineSeed, changedRatified),
  });
  // binding.book's concept changed -> not carried; stale-concept is not in the
  // current seed -> not carried.
  assert.deepEqual(candidates.bindings, []);
  assert.deepEqual(candidates.surfaceBindings, []);
  assert.deepEqual(candidates.witnesses, []);
});

test("carry-forward candidates keep unchanged concept, surface, and commitment mappings", () => {
  const draft = {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.book-slot", role: "behavior", name: "Book Slot" },
      { id: "resource.booking", role: "resource", name: "Booking" },
    ],
    commitments: [
      { id: "commitment.booking-creates-booking", source: "behavior.book-slot", relation: "creates", target: { concept: "resource.booking" } },
    ],
    surfaces: [
      { id: "surface.book-api", name: "Book via API", behavior: "behavior.book-slot", channel: "api", access: "authenticated" },
    ],
    scenarios: [],
    context: [],
  };
  const baselineSeed = { ...draft, ratification: { status: "ratified", contentHash: seedContentHash(draft) } };
  const realization = {
    formatVersion: 2,
    seedHash: seedContentHash(baselineSeed),
    bindings: [
      { id: "binding.book", concept: "behavior.book-slot", artifact: { kind: "operation", key: "POST /bookings" } },
    ],
    surfaceBindings: [
      { id: "surface-binding.book", surface: "surface.book-api", artifact: { kind: "operation", key: "POST /bookings" } },
    ],
    witnesses: [
      { commitment: "commitment.booking-creates-booking", sourceBinding: "binding.book", target: { concept: "resource.booking" } },
    ],
  };
  // Context-only change: every concept/surface/commitment definition is unchanged.
  const changedSeed = {
    ...baselineSeed,
    context: [...baselineSeed.context, { id: "context.note", text: "A note" }],
  };
  const changedRatified = { ...changedSeed, ratification: { status: "ratified", contentHash: seedContentHash(changedSeed) } };
  const candidates = carryForwardCandidates({
    baselineSeed,
    baselineRealization: realization,
    currentSeed: changedRatified,
    changes: diffSeeds(baselineSeed, changedRatified),
  });
  assert.equal(candidates.bindings.length, 1);
  assert.equal(candidates.bindings[0].id, "binding.book");
  assert.equal(candidates.surfaceBindings.length, 1);
  assert.equal(candidates.surfaceBindings[0].id, "surface-binding.book");
  assert.equal(candidates.witnesses.length, 1);
  assert.equal(candidates.witnesses[0].commitment, "commitment.booking-creates-booking");
});

