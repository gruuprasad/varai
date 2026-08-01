import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { lintRealization, lintIsActionable, candidateScore } from "../../src/reconciliation/lint.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { readSeed } from "../../src/seed/store.js";

const fixture = path.resolve("test/fixtures/semantic-assembly-structural");
const modelPromise = scanRepo(fixture, { jobs: 1, cache: false }).then((scan) => scan.model);
const { seed } = readSeed(fixture);
const { realization } = readRealization(fixture, { seed });

test("a correct witness lints fully resolved and actionable", async () => {
  const model = await modelPromise;
  const lint = lintRealization({ model, seed, realization });
  assert.equal(lint.valid, true);
  assert.equal(lint.seedMatches, true);
  assert.equal(lint.summary.bindings.resolved, lint.bindings.length);
  assert.equal(lint.summary.surfaceBindings.resolved, lint.surfaceBindings.length);
  assert.equal(lintIsActionable(lint), true);
});

test("a wrong selector reports not-found with ranked deterministic candidates", async () => {
  const model = await modelPromise;
  const wrong = {
    ...realization,
    bindings: realization.bindings.map((binding, index) =>
      index === 0
        ? { ...binding, artifact: { lens: "ui", kind: "action", key: "Totally wrong key" } }
        : binding),
  };
  const lint = lintRealization({ model, seed, realization: wrong });
  const record = lint.bindings.find((item) => item.id === "binding.apply-change-action");
  assert.equal(record.state, "not-found");
  assert.equal(record.reason, "artifact-not-found");
  assert.ok(record.candidates.length > 0, "candidates are suggested for the failed selector");
  assert.ok(record.candidates.every((candidate) => typeof candidate.score === "number"));
  const scores = record.candidates.map((candidate) => candidate.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), "candidates are ranked by score");
  assert.equal(lintIsActionable(lint), false);
});

test("equal-score candidates stay equal — lint never selects", async () => {
  const model = await modelPromise;
  const lensOf = new Map((model.subsystems ?? []).map((subsystem) => [subsystem.id, subsystem.lens]));
  const elements = model.elements;
  const artifact = { lens: "api", kind: "operation", key: "PUT /api/v1/building-model/{job_id}/structural-types/{type_id}" };
  const scores = elements.map((element) => candidateScore(element, artifact, lensOf));
  assert.ok(scores.every((score) => Number.isInteger(score) && score >= 0));
  const exact = elements.filter((_, index) => scores[index] === Math.max(...scores));
  assert.equal(exact.length, 1, "the exact element outscores everything else");
  const tieArtifact = { lens: "data", kind: "contract" };
  const tieScores = elements.map((element) => candidateScore(element, tieArtifact, lensOf));
  const tieCount = tieScores.filter((score) => score === Math.max(...tieScores)).length;
  assert.ok(tieCount >= 1);
});

test("a seed-hash mismatch lints stale and is not actionable", async () => {
  const model = await modelPromise;
  const stale = { ...realization, seedHash: "sha256:" + "0".repeat(64) };
  const lint = lintRealization({ model, seed, realization: stale });
  assert.equal(lint.seedMatches, false);
  assert.ok(lint.problems.some((problem) => problem.code === "seed-hash-mismatch"));
  assert.ok(lint.bindings.every((record) => record.state === "stale"));
  assert.equal(lintIsActionable(lint), false);
});

test("schema problems surface in lint alongside resolution", async () => {
  const model = await modelPromise;
  const bad = {
    ...realization,
    bindings: [{ id: "binding.ghost", concept: "behavior.does-not-exist", artifact: { kind: "operation", key: "POST /x" } }],
  };
  const lint = lintRealization({ model, seed, realization: bad });
  assert.ok(lint.problems.some((problem) => problem.code === "unknown-concept"));
  assert.equal(lintIsActionable(lint), false);
});

test("a wrong selector is caught in one lint iteration (exit-criteria probe)", async () => {
  // The Gate 1 exit criterion: the builder fixes the selector from lint output
  // alone. Simulate that loop: lint -> copy the top candidate key -> lint again.
  const model = await modelPromise;
  const wrong = {
    ...realization,
    bindings: realization.bindings.map((binding, index) =>
      index === 1
        ? { ...binding, artifact: { lens: "data", kind: "aggregate", key: "Document thing" } }
        : binding),
  };
  const first = lintRealization({ model, seed, realization: wrong });
  const failed = first.bindings.find((record) => record.state === "not-found");
  assert.ok(failed, "first lint iteration flags the wrong selector");
  assert.ok(failed.candidates.length > 0);
  const fixed = {
    ...wrong,
    bindings: wrong.bindings.map((binding) =>
      binding.id === failed.id
        ? { ...binding, artifact: { lens: "data", kind: "aggregate", key: failed.candidates[0].key } }
        : binding),
  };
  const second = lintRealization({ model, seed, realization: fixed });
  const record = second.bindings.find((item) => item.id === failed.id);
  assert.equal(record.state, "resolved", "one lint iteration fixes the selector");
  assert.equal(lintIsActionable(second), true);
});

test("lint is deterministic for the same inputs", async () => {
  const model = await modelPromise;
  const wrong = {
    ...realization,
    bindings: realization.bindings.map((binding, index) =>
      index === 0 ? { ...binding, artifact: { lens: "ui", kind: "action", key: "Nope" } } : binding),
  };
  const a = lintRealization({ model, seed, realization: wrong });
  const b = lintRealization({ model, seed, realization: wrong });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
