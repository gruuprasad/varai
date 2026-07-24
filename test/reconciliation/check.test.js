import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { literalMatches, reconcile } from "../../src/reconciliation/check.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { readSeed } from "../../src/seed/store.js";
import { seedContentHash } from "../../src/seed/identity.js";

const fixture = path.resolve("test/fixtures/semantic-assembly-structural");
const modelPromise = scanRepo(fixture, { jobs: 1, cache: false }).then((scan) => scan.model);
const { seed } = readSeed(fixture);
const { realization } = readRealization(fixture, { seed });

const byCommitment = (report, id) => report.commitments.find((item) => item.id === id);

test("the correct witness resolves and every commitment holds", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  assert.equal(report.summary.total, 5);
  assert.equal(report.summary.holds, 5);
  assert.equal(report.summary.violated, 0);
  assert.equal(report.ratified, true);
  assert.equal(report.realization.stale, false);
  for (const item of report.commitments) {
    assert.equal(item.bindingState, "resolved", item.id);
    assert.equal(item.verdict, "holds", item.id);
    assert.ok(item.claimIds.length > 0, `${item.id} cites canonical claims`);
    assert.ok(item.evidence.length > 0, `${item.id} cites evidence`);
  }
});

test("every holds verdict cites claim IDs from the canonical model", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  const claimIds = new Set(model.claims.map((claim) => claim.id));
  for (const item of report.commitments) {
    for (const id of item.claimIds) assert.ok(claimIds.has(id), `${id} is a canonical claim`);
  }
});

test("literal matching follows the acknowledged guard phrase", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  const item = byCommitment(report, "commitment.apply-change-requires-acknowledgement");
  const claims = model.claims.filter((claim) => item.claimIds.includes(claim.id));
  assert.ok(claims.some((claim) =>
    claim.target.value === "integrity changes acknowledged when preview has integrity changes"),
  "the seed phrase matches the longer observed guard literal");
});

test("literal matching is exact or contiguous phrase containment", () => {
  assert.equal(literalMatches("409", "409"), true);
  assert.equal(literalMatches("integrity changes acknowledged", "Integrity changes acknowledged when preview has integrity changes"), true);
  assert.equal(literalMatches("acknowledged when preview", "integrity changes acknowledged when preview has integrity changes"), true);
  assert.equal(literalMatches("changes preview", "integrity changes acknowledged when preview has integrity changes"), false);
  assert.equal(literalMatches("40", "409"), false);
  assert.equal(literalMatches("slot unavailable", "slot is available"), false);
});

test("a missing witness leaves every commitment unbound", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization: null });
  assert.equal(report.realization.present, false);
  assert.equal(report.summary.holds, 0);
  assert.equal(report.summary.binding.unbound, 5);
  for (const item of report.commitments) {
    assert.equal(item.bindingState, "unbound");
    assert.equal(item.verdict, "cannot_verify");
    assert.deepEqual(item.reasons, ["unbound-source"]);
  }
});

test("concept bindings alone check commitments when no claim witnesses exist", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization: { ...realization, witnesses: [] } });
  assert.equal(report.summary.holds, 5);
});


test("a wrong selector is stale, not violated", async () => {
  const model = await modelPromise;
  const wrong = structuredClone(realization);
  wrong.bindings.find((binding) => binding.id === "binding.put-structural-type-operation")
    .artifact.key = "DELETE /nope";
  const report = reconcile({ model, seed, realization: wrong });
  const item = byCommitment(report, "commitment.put-changes-document");
  assert.equal(item.bindingState, "stale");
  assert.equal(item.verdict, "cannot_verify");
  assert.deepEqual(item.reasons, ["stale-source"]);
  assert.equal(byCommitment(report, "commitment.apply-change-requires-acknowledgement").verdict, "holds");
});

test("a broad selector is ambiguous", async () => {
  const model = await modelPromise;
  const widened = structuredClone(model);
  const operation = widened.elements.find((item) => item.name.startsWith("PUT /api/v1"));
  widened.elements.push({ ...operation, id: "element:duplicate-for-ambiguity" });
  const report = reconcile({ model: widened, seed, realization });
  const item = byCommitment(report, "commitment.put-changes-document");
  assert.equal(item.bindingState, "ambiguous");
  assert.equal(item.verdict, "cannot_verify");
  assert.deepEqual(item.reasons, ["ambiguous-source"]);
});

test("an unbound target concept blocks verification honestly", async () => {
  const model = await modelPromise;
  const partial = structuredClone(realization);
  partial.bindings = partial.bindings.filter((binding) => binding.id !== "binding.building-model-document");
  const report = reconcile({ model, seed, realization: partial });
  const item = byCommitment(report, "commitment.put-changes-document");
  assert.equal(item.bindingState, "unbound");
  assert.equal(item.verdict, "cannot_verify");
  assert.deepEqual(item.reasons, ["unbound-target"]);
});

test("a removed matching claim is violated only under analyzed coverage", async () => {
  const model = await modelPromise;
  const narrowed = structuredClone(model);
  const operation = narrowed.elements.find((item) => item.name.startsWith("PUT /api/v1"));
  const aggregate = narrowed.elements.find((item) => item.name === "BuildingModelDocument");
  narrowed.claims = narrowed.claims.filter((claim) =>
    !(claim.sourceId === operation.id && claim.relation === "changes" && claim.target.id === aggregate.id));
  const apiScope = narrowed.subsystems.find((item) => item.lens === "api").id;
  for (const record of narrowed.coverage) {
    if (record.capability === "api.effect" && record.scopeId === apiScope) record.state = "analyzed";
  }
  const report = reconcile({ model: narrowed, seed, realization });
  const item = byCommitment(report, "commitment.put-changes-document");
  assert.equal(item.bindingState, "resolved");
  assert.equal(item.verdict, "violated");
  assert.deepEqual(item.reasons, ["claim-absent-under-analyzed-coverage"]);
  assert.ok(item.coverage.some((record) => record.capability === "api.effect" && record.state === "analyzed"));
});

test("partial effect coverage produces cannot_verify, never a violation", async () => {
  const model = await modelPromise;
  const narrowed = structuredClone(model);
  const operation = narrowed.elements.find((item) => item.name.startsWith("PUT /api/v1"));
  const aggregate = narrowed.elements.find((item) => item.name === "BuildingModelDocument");
  narrowed.claims = narrowed.claims.filter((claim) =>
    !(claim.sourceId === operation.id && claim.relation === "changes" && claim.target.id === aggregate.id));
  const report = reconcile({ model: narrowed, seed, realization });
  const item = byCommitment(report, "commitment.put-changes-document");
  assert.equal(item.verdict, "cannot_verify");
  assert.deepEqual(item.reasons, ["insufficient-coverage"]);
  assert.ok(item.coverage.every((record) => record.state === "partial"));
});

test("a stale seed hash invalidates all builder witnesses", async () => {
  const model = await modelPromise;
  const stale = { ...realization, seedHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111" };
  const report = reconcile({ model, seed, realization: stale });
  assert.equal(report.realization.stale, true);
  assert.equal(report.summary.holds, 0);
  assert.equal(report.summary.binding.stale, 5);
  for (const item of report.commitments) {
    assert.equal(item.bindingState, "stale");
    assert.equal(item.verdict, "cannot_verify");
  }
});

test("collection reordering produces byte-identical reconciliation", async () => {
  const model = await modelPromise;
  const baseline = reconcile({ model, seed, realization });
  const shuffledSeed = {
    ...seed,
    concepts: [...seed.concepts].reverse(),
    commitments: [...seed.commitments].reverse(),
  };
  const shuffledRealization = {
    ...realization,
    bindings: [...realization.bindings].reverse(),
    witnesses: [...realization.witnesses].reverse(),
  };
  const shuffledModel = {
    ...model,
    elements: [...model.elements].reverse(),
    claims: [...model.claims].reverse(),
    coverage: [...model.coverage].reverse(),
  };
  const reordered = reconcile({ model: shuffledModel, seed: shuffledSeed, realization: shuffledRealization });
  assert.equal(JSON.stringify(reordered), JSON.stringify(baseline));
});

// A minimal, inline scenario isolates the soundness property from the fixture:
// the source operation creates Booking (observed) but NOT Outbox. A truthful
// witness therefore cannot confirm the "creates outbox" commitment. A lying
// witness that rebinds the Outbox concept onto the Booking element must NOT be
// able to borrow Booking's creates-claim to fake a holds.
function collisionScenario() {
  const seed = {
    formatVersion: 1,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.book", role: "behavior", name: "Book" },
      { id: "resource.booking", role: "resource", name: "Booking" },
      { id: "resource.outbox", role: "resource", name: "Outbox" },
    ],
    commitments: [
      { id: "commitment.book-creates-booking", source: "behavior.book", relation: "creates", target: { concept: "resource.booking" } },
      { id: "commitment.book-creates-outbox", source: "behavior.book", relation: "creates", target: { concept: "resource.outbox" } },
    ],
    context: [],
  };
  const model = {
    system: { id: "demo", key: "demo", name: "Demo" },
    subsystems: [{ id: "sub.api", lens: "api" }, { id: "sub.data", lens: "data" }],
    elements: [
      { id: "el.op", name: "POST /bookings", kind: "operation", key: "POST /bookings", subsystemId: "sub.api", evidence: [] },
      { id: "el.booking", name: "Booking", kind: "entity", key: "Booking", subsystemId: "sub.data", evidence: [] },
      { id: "el.outbox", name: "Outbox", kind: "entity", key: "Outbox", subsystemId: "sub.data", evidence: [] },
    ],
    claims: [
      { id: "claim.creates-booking", sourceId: "el.op", relation: "creates", target: { kind: "reference", id: "el.booking" }, claimState: "observed", evidence: [{ file: "main.py", line: 5, symbol: "book" }], implementationPath: [] },
    ],
    coverage: [],
  };
  const seedHash = seedContentHash(seed);
  const bindings = [
    { id: "binding.book", concept: "behavior.book", artifact: { lens: "api", kind: "operation", key: "POST /bookings" } },
    { id: "binding.booking", concept: "resource.booking", artifact: { lens: "data", kind: "entity", key: "Booking" } },
    { id: "binding.outbox", concept: "resource.outbox", artifact: { lens: "data", kind: "entity", key: "Outbox" } },
  ];
  const witnesses = [
    { commitment: "commitment.book-creates-booking", sourceBinding: "binding.book", target: { concept: "resource.booking" } },
    { commitment: "commitment.book-creates-outbox", sourceBinding: "binding.book", target: { concept: "resource.outbox" } },
  ];
  return { seed, model, seedHash, bindings, witnesses };
}

test("a mislabeled target binding cannot fake a holds", () => {
  const { seed, model, seedHash, bindings, witnesses } = collisionScenario();
  // Attack: rebind the Outbox concept onto the Booking element, which carries a creates-claim.
  const attackBindings = structuredClone(bindings);
  attackBindings.find((b) => b.id === "binding.outbox").artifact.key = "Booking";
  const realization = { formatVersion: 1, seedHash, bindings: attackBindings, witnesses };
  const report = reconcile({ model, seed, realization });
  const outbox = report.commitments.find((c) => c.id === "commitment.book-creates-outbox");
  assert.notEqual(outbox.verdict, "holds", "a wrong target binding must not borrow another concept's claim");
  assert.equal(outbox.verdict, "cannot_verify");
  assert.equal(outbox.bindingState, "ambiguous");
  assert.deepEqual(outbox.reasons, ["ambiguous-target"]);
});

test("a performs commitment is recorded as not_checkable, never a silent absence", () => {
  const { model } = collisionScenario();
  const seed = {
    formatVersion: 1,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "actor.member", role: "actor", name: "Member" },
      { id: "behavior.book", role: "behavior", name: "Book" },
    ],
    commitments: [
      { id: "commitment.member-performs-book", source: "actor.member", relation: "performs", target: { concept: "behavior.book" } },
    ],
    context: [],
  };
  const realization = { formatVersion: 1, seedHash: seedContentHash(seed), bindings: [], witnesses: [] };
  const report = reconcile({ model, seed, realization });
  const item = report.commitments.find((c) => c.id === "commitment.member-performs-book");
  assert.equal(item.verdict, "not_checkable");
  assert.deepEqual(item.reasons, ["no-checker-semantics"]);
  assert.equal(report.summary.notCheckable, 1);
});

// Positive depends_on commitments only: present → holds; absent + analyzed → violated;
// absent without matching analyzed coverage → cannot_verify. No forbidden-edge semantics.
function dependsOnScenario({ claim = true, analyzed = true } = {}) {
  const seed = {
    formatVersion: 1,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "behavior.ui", role: "behavior", name: "UI" },
      { id: "behavior.api", role: "behavior", name: "API" },
    ],
    commitments: [
      {
        id: "commitment.ui-depends-on-api",
        source: "behavior.ui",
        relation: "depends_on",
        target: { concept: "behavior.api" },
      },
    ],
    context: [],
  };
  const model = {
    system: { id: "demo", key: "demo", name: "Demo" },
    subsystems: [{ id: "sub.ui", lens: "ui" }, { id: "sub.api", lens: "api" }],
    elements: [
      { id: "el.ui", name: "Screen", kind: "screen", key: "screen", subsystemId: "sub.ui", evidence: [] },
      { id: "el.api", name: "GET /items", kind: "operation", key: "GET /items", subsystemId: "sub.api", evidence: [] },
    ],
    claims: claim
      ? [{
        id: "claim.ui-depends-api",
        sourceId: "el.ui",
        relation: "depends_on",
        target: { kind: "reference", id: "el.api" },
        claimState: "observed",
        evidence: [{ file: "ui.tsx", line: 4, symbol: "fetch" }],
        implementationPath: [],
      }]
      : [],
    coverage: analyzed
      ? [{ capability: "arch.dependency", scopeId: "sub.ui", state: "analyzed" }]
      : [],
  };
  const seedHash = seedContentHash(seed);
  const realization = {
    formatVersion: 1,
    seedHash,
    bindings: [
      { id: "binding.ui", concept: "behavior.ui", artifact: { lens: "ui", kind: "screen", key: "screen" } },
      { id: "binding.api", concept: "behavior.api", artifact: { lens: "api", kind: "operation", key: "GET /items" } },
    ],
    witnesses: [
      {
        commitment: "commitment.ui-depends-on-api",
        sourceBinding: "binding.ui",
        target: { concept: "behavior.api" },
      },
    ],
  };
  return { seed, model, realization };
}

test("a present depends_on commitment holds", () => {
  const { seed, model, realization } = dependsOnScenario({ claim: true });
  const report = reconcile({ model, seed, realization });
  const item = byCommitment(report, "commitment.ui-depends-on-api");
  assert.equal(item.bindingState, "resolved");
  assert.equal(item.verdict, "holds");
  assert.ok(item.claimIds.includes("claim.ui-depends-api"));
});

test("an absent depends_on under analyzed arch.dependency coverage is violated", () => {
  const { seed, model, realization } = dependsOnScenario({ claim: false, analyzed: true });
  const report = reconcile({ model, seed, realization });
  const item = byCommitment(report, "commitment.ui-depends-on-api");
  assert.equal(item.bindingState, "resolved");
  assert.equal(item.verdict, "violated");
  assert.deepEqual(item.reasons, ["claim-absent-under-analyzed-coverage"]);
  assert.ok(item.coverage.some((record) => record.capability === "arch.dependency" && record.state === "analyzed"));
});

test("an absent depends_on without analyzed coverage cannot_verify", () => {
  const { seed, model, realization } = dependsOnScenario({ claim: false, analyzed: false });
  const report = reconcile({ model, seed, realization });
  const item = byCommitment(report, "commitment.ui-depends-on-api");
  assert.equal(item.verdict, "cannot_verify");
  assert.deepEqual(item.reasons, ["insufficient-coverage"]);
});
