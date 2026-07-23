import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { buildReviewProjection } from "../../src/server/reconciliation.js";
import { readSeed } from "../../src/seed/store.js";

const fixture = path.resolve("test/fixtures/semantic-assembly-structural");
const projectionPromise = (async () => {
  const { model } = await scanRepo(fixture, { jobs: 1, cache: false });
  const { seed } = readSeed(fixture);
  const { realization } = readRealization(fixture, { seed });
  const report = reconcile({ model, seed, realization });
  return { model, report, review: buildReviewProjection({ report, model }) };
})();

const cardById = (review, id) => review.groups.flatMap((group) => group.cards).find((card) => card.id === id);

test("the review groups commitments by source concept with realization counts", async () => {
  const { review } = await projectionPromise;
  const applyChange = review.groups.find((group) => group.concept === "behavior.apply-change");
  const put = review.groups.find((group) => group.concept === "behavior.put-structural-type");
  assert.ok(applyChange && put);
  assert.equal(applyChange.total, 2);
  assert.equal(applyChange.holds, 2);
  assert.equal(put.total, 3);
  assert.equal(put.holds, 3);
  assert.equal(review.summary.holds, 5);
});

test("bindings resolve to named elements and claims stay separate from testimony", async () => {
  const { review } = await projectionPromise;
  const card = cardById(review, "commitment.put-changes-document");
  const operationBinding = card.bindings.find((binding) => binding.id === "binding.put-structural-type-operation");
  assert.deepEqual(operationBinding.elements.map((element) => element.name),
    ["PUT /api/v1/building-model/{job_id}/structural-types/{type_id}"]);
  assert.equal(operationBinding.state, "resolved");
  assert.ok(card.claims.length > 0, "observed claims are present alongside testimony");
  assert.ok(card.claims.every((claim) => claim.id.startsWith("claim:")));
  assert.notDeepEqual(card.bindings, card.claims, "witness and observation are not merged");
});

test("the reading order begins at the interface and reaches the domain evidence", async () => {
  const { review } = await projectionPromise;
  const card = cardById(review, "commitment.put-changes-document");
  assert.equal(card.readingOrder[0].why, "interface");
  assert.equal(card.readingOrder[0].file, "routes.py");
  assert.ok(card.readingOrder.some((step) => step.file === "domain.py" && step.symbol === "update_structural_type"),
    "reading order follows the implementation path to the domain operation");
  assert.deepEqual(card.readingOrder, cardById(review, "commitment.put-changes-document").readingOrder,
    "reading order is deterministic across lookups");
});

test("a related behavioral envelope is linked for presentation", async () => {
  const { review } = await projectionPromise;
  const card = cardById(review, "commitment.put-changes-document");
  assert.ok(card.envelope, "envelope is linked");
  assert.equal(card.envelope.name, "Apply change");
  assert.equal(card.envelope.completeness, "closed");
});

test("coverage limitations list exactly the cannot_verify commitments", async () => {
  const { report, model } = await projectionPromise;
  const degraded = structuredClone(model);
  const operation = degraded.elements.find((item) => item.name.startsWith("PUT /api/v1"));
  const aggregate = degraded.elements.find((item) => item.name === "BuildingModelDocument");
  degraded.claims = degraded.claims.filter((claim) =>
    !(claim.sourceId === operation.id && claim.relation === "changes" && claim.target.id === aggregate.id));
  const { seed } = readSeed(fixture);
  const { realization } = readRealization(fixture, { seed });
  const degradedReport = reconcile({ model: degraded, seed, realization });
  const review = buildReviewProjection({ report: degradedReport, model: degraded });
  assert.deepEqual(review.coverageLimitations.map((item) => item.id), ["commitment.put-changes-document"]);
  assert.deepEqual(review.coverageLimitations[0].reasons, ["insufficient-coverage"]);
  assert.ok(review.coverageLimitations[0].coverage.length > 0);
});
