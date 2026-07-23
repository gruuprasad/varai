import assert from "node:assert/strict";
import test from "node:test";
import { bucketCards, findCard, headlineSentence, renderRowDetail, requirementSentence } from "../../src/ui/report-view.js";

const detailCard = {
  id: "c.holds",
  verdict: "holds",
  relation: "creates",
  sourceName: "Book Slot",
  targetName: "Booking",
  reasons: [],
  bindings: [{ concept: "behavior.book-slot", state: "resolved", elements: [{ name: "POST /api/bookings" }] }],
  claims: [{ targetName: "Booking", claimState: "present", evidence: [{ file: "backend/app/main.py", line: 25 }], implementationPath: [] }],
  readingOrder: [{ why: "INTERFACE", file: "backend/app/main.py", line: 25 }],
};

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

test("findCard locates a requirement by commitment id across groups", () => {
  assert.equal(findCard(review, "c.holds")?.verdict, "holds");
  assert.equal(findCard(review, "missing-id"), null);
  assert.equal(findCard(null, "c.holds"), null);
});

test("renderRowDetail is the shared You asked / builder / varai found card", () => {
  const html = renderRowDetail(detailCard);
  assert.match(html, /You asked/);
  assert.match(html, /The builder says/);
  assert.match(html, /varai found/);
  assert.match(html, /Suggested code-reading order/);
  assert.match(html, /POST \/api\/bookings/);
  assert.match(html, /backend\/app\/main\.py/);
});
