import assert from "node:assert/strict";
import test from "node:test";
import { bucketCards, headlineSentence, requirementSentence } from "../../src/ui/report-view.js";

const review = {
  summary: { holds: 1, violated: 1, cannotVerify: 1, notCheckable: 1 },
  groups: [{
    concept: "behavior.book-slot",
    cards: [
      { id: "c.holds", verdict: "holds", relation: "creates", sourceName: "Book slot", targetName: "Booking" },
      { id: "c.noted", verdict: "not_checkable", relation: "performs", sourceName: "Member", targetName: "Book slot" },
      { id: "c.missing", verdict: "violated", relation: "creates", sourceName: "Book slot", targetName: "Audit record" },
      { id: "c.unknown", verdict: "cannot_verify", relation: "requires", sourceName: "Book slot", targetName: "slot is available" },
    ],
  }],
};

test("requirements are bucketed by what needs attention, worst first", () => {
  const order = bucketCards(review).map((bucket) => bucket.verdict);
  assert.deepEqual(order, ["violated", "cannot_verify", "not_checkable", "holds"]);
});

test("a requirement reads as an English sentence and the headline excludes uncheckable rules", () => {
  assert.equal(requirementSentence(review.groups[0].cards[0]), "Book slot creates Booking");
  assert.equal(requirementSentence(review.groups[0].cards[1]), "Member can Book slot");
  assert.match(headlineSentence(review), /1 of 3 requirements are confirmed/);
});
