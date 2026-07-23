import assert from "node:assert/strict";
import test from "node:test";
import { diffIsEmpty, diffSeeds } from "../../src/seed/diff.js";
import { slotkeeperDraft } from "./fixtures.js";

test("a rename is a change under a stable id, never a remove plus add", () => {
  const before = slotkeeperDraft();
  const after = {
    ...before,
    concepts: before.concepts.map((concept) =>
      concept.id === "behavior.book-slot" ? { ...concept, name: "Reserve Slot" } : concept),
  };
  const diff = diffSeeds(before, after);
  assert.deepEqual(diff.concepts.added, []);
  assert.deepEqual(diff.concepts.removed, []);
  assert.deepEqual(diff.concepts.changed.map((pair) => pair.after.id), ["behavior.book-slot"]);
  assert.equal(diffIsEmpty(diff), false);
});

test("added and removed entries are reported in deterministic id order", () => {
  const before = slotkeeperDraft();
  const after = {
    ...before,
    concepts: before.concepts.filter((concept) => concept.id !== "resource.slot"),
    commitments: [
      ...before.commitments.filter((commitment) => commitment.target?.concept !== "resource.slot"),
      { id: "commitment.aaa-new", source: "behavior.book-slot", relation: "reads", target: { concept: "resource.booking" } },
    ],
  };
  const diff = diffSeeds(before, after);
  assert.deepEqual(diff.concepts.removed.map((item) => item.id), ["resource.slot"]);
  assert.deepEqual(diff.commitments.added.map((item) => item.id), ["commitment.aaa-new"]);
  assert.deepEqual(diffSeeds(after, before).concepts.added.map((item) => item.id), ["resource.slot"]);
});

test("identical documents produce an empty diff", () => {
  const seed = slotkeeperDraft();
  assert.equal(diffIsEmpty(diffSeeds(seed, seed)), true);
  assert.equal(diffSeeds(null, seed).systemChanged, false, "a first draft has no prior system to change");
});
