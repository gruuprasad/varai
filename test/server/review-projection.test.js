import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewProjection } from "../../src/server/reconciliation.js";
import { SYSTEM_MODEL_SCHEMA_VERSION } from "../../src/system-model/version.js";

const seed = {
  concepts: [
    { id: "actor.administrator", name: "Administrator" },
    { id: "behavior.cancel-booking", name: "Cancel booking" },
  ],
};
const model = {
  schemaVersion: SYSTEM_MODEL_SCHEMA_VERSION,
  system: { id: "system.slotkeeper", name: "Slotkeeper" },
  subsystems: [], elements: [], claims: [], coverage: [], diagnostics: [],
};
const report = {
  system: { name: "Slotkeeper" },
  summary: { holds: 0, violated: 0, cannotVerify: 0, notCheckable: 1 },
  commitments: [{
    id: "commitment.admin-performs-cancel",
    source: "actor.administrator",
    relation: "performs",
    target: { concept: "behavior.cancel-booking" },
    verdict: "not_checkable",
    reasons: [],
    bindings: [],
    claimIds: [],
    coverage: [],
  }],
};

test("not_checkable commitments leave the confirmed denominator and concepts get plain names", () => {
  const review = buildReviewProjection({ report, model, seed });
  const [group] = review.groups;

  assert.equal(group.conceptName, "Administrator");
  assert.equal(group.holds, 0);
  assert.equal(group.checkable, 0, "a performs commitment is not checkable, so nothing is pending");
  assert.equal(group.notCheckable, 1);
  assert.equal(group.total, 1);

  assert.equal(group.cards[0].sourceName, "Administrator");
  assert.equal(group.cards[0].targetName, "Cancel booking");
});
