import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeSeed, canonicalStringifySeed, seedSemanticContent } from "../../src/seed/canonicalize.js";
import { commitmentId, conceptId, contextId, seedContentHash, slugify } from "../../src/seed/identity.js";
import { checkSeed, SeedValidationError, validateSeed } from "../../src/seed/validate.js";
import { slotkeeperDraft } from "./fixtures.js";

test("a valid seed canonicalizes byte-identically under input reordering", () => {
  const draft = slotkeeperDraft();
  const reordered = {
    context: [...draft.context].reverse(),
    ratification: undefined,
    commitments: [...draft.commitments].reverse(),
    system: { name: draft.system.name, id: draft.system.id },
    concepts: [...draft.concepts].reverse(),
    formatVersion: draft.formatVersion,
  };
  delete reordered.ratification;
  assert.equal(canonicalStringifySeed(canonicalizeSeed(reordered)), canonicalStringifySeed(canonicalizeSeed(draft)));
  assert.equal(seedContentHash(reordered), seedContentHash(draft));
});

test("unknown roles, relations, and fields fail with clear codes", () => {
  const draft = slotkeeperDraft();
  draft.concepts[0].role = "person";
  draft.concepts[1].extra = true;
  draft.commitments[0].relation = "forbids";
  draft.unknown = 1;
  const result = checkSeed(draft);
  assert.equal(result.valid, false);
  const codes = result.problems.map((problem) => problem.code);
  assert.ok(codes.includes("unknown-concept-role"));
  assert.ok(codes.includes("unknown-field"));
  assert.ok(codes.includes("unknown-relation"));
});

test("dangling concept references fail", () => {
  const draft = slotkeeperDraft();
  draft.commitments[0].source = "behavior.missing";
  draft.commitments[1].target = { concept: "resource.missing" };
  const codes = checkSeed(draft).problems.map((problem) => problem.code);
  assert.deepEqual([...new Set(codes)], ["dangling-concept-reference"]);
});

test("duplicate stable IDs fail", () => {
  const draft = slotkeeperDraft();
  draft.concepts.push({ ...draft.concepts[1] });
  assert.ok(checkSeed(draft).problems.some((problem) => problem.code === "duplicate-id"));
});

test("validateSeed throws a SeedValidationError listing every problem", () => {
  const draft = slotkeeperDraft();
  draft.commitments[0].relation = "forbids";
  draft.commitments[1].relation = "blocks";
  assert.throws(() => validateSeed(draft), (err) => {
    assert.ok(err instanceof SeedValidationError);
    assert.equal(err.problems.length, 2);
    return true;
  });
});

test("semantic content hash excludes ratification metadata", () => {
  const draft = slotkeeperDraft();
  const ratified = { ...draft, ratification: { status: "ratified", contentHash: seedContentHash(draft), ratifiedAt: "2026-07-23T00:00:00Z" } };
  assert.equal(seedContentHash(ratified), seedContentHash(draft));
  assert.deepEqual(seedSemanticContent(ratified), seedSemanticContent(draft));
  assert.equal(validateSeed(ratified).valid, true);
});

test("a rename preserves identity", () => {
  const draft = slotkeeperDraft();
  const renamed = {
    ...draft,
    concepts: draft.concepts.map((concept) =>
      concept.id === "behavior.book-slot" ? { ...concept, name: "Reserve Slot" } : concept),
  };
  const result = validateSeed(renamed);
  assert.equal(result.valid, true);
  assert.ok(renamed.concepts.some((concept) => concept.id === "behavior.book-slot"));
  assert.ok(renamed.commitments.every((commitment) => commitment.source === "behavior.book-slot"));
  assert.notEqual(result.contentHash, seedContentHash(draft));
});

test("changing semantic content invalidates the old ratification hash", () => {
  const draft = slotkeeperDraft();
  const ratified = { ...draft, ratification: { status: "ratified", contentHash: seedContentHash(draft) } };
  const changed = {
    ...ratified,
    concepts: ratified.concepts.map((concept) =>
      concept.id === "resource.slot" ? { ...concept, name: "Time Slot" } : concept),
  };
  assert.ok(checkSeed(changed).problems.some((problem) => problem.code === "ratification-hash-mismatch"));
});

test("a ratified seed requires a content hash", () => {
  const draft = { ...slotkeeperDraft(), ratification: { status: "ratified" } };
  assert.ok(checkSeed(draft).problems.some((problem) => problem.code === "missing-content-hash"));
});

test("identity helpers mint stable ids from names", () => {
  assert.equal(slugify("Book Slot!"), "book-slot");
  assert.equal(conceptId("behavior", "Book Slot"), "behavior.book-slot");
  assert.equal(commitmentId("booking creates booking"), "commitment.booking-creates-booking");
  assert.equal(contextId("atomicity"), "context.atomicity");
  assert.throws(() => slugify("!!!"));
});
