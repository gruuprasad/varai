import assert from "node:assert/strict";
import test from "node:test";
import {
  renderCardDetail,
  renderCompactCard,
  renderCoverageLimitations,
  renderReviewOverview,
  verdictChip,
} from "../../src/ui/review-view.js";

const review = {
  system: { name: "Slotkeeper" },
  seedHash: "sha256:819170d7b9a9",
  ratified: true,
  realization: { present: true, stale: false },
  summary: { total: 3, holds: 2, violated: 0, cannotVerify: 1, notCheckable: 0 },
  context: [{ id: "context.atomicity", text: "Booking must be atomic" }],
  groups: [{
    concept: "behavior.book-slot",
    holds: 2,
    total: 3,
    cards: [{
      id: "commitment.book-slot-creates-booking",
      source: "behavior.book-slot",
      relation: "creates",
      target: { concept: "resource.booking" },
      bindingState: "resolved",
      verdict: "holds",
      reasons: [],
      bindings: [{ id: "binding.book-slot-operation", concept: "behavior.book-slot", state: "resolved", reason: null, elements: [{ id: "el:1", name: "POST /api/bookings", kind: "operation" }] }],
      claims: [{ id: "claim:1", relation: "creates", claimState: "inferred", targetName: "Booking", evidence: [{ file: "backend/app/main.py", line: 34 }], implementationPath: [{ file: "backend/app/main.py", line: 30 }, { file: "backend/app/main.py", line: 34 }] }],
      coverage: [],
      envelope: { id: "env:1", name: "Book slot", completeness: "closed" },
      readingOrder: [
        { file: "backend/app/main.py", line: 30, why: "interface" },
        { file: "backend/app/main.py", line: 34, symbol: "book_slot", why: "path" },
      ],
    }],
  }],
  coverageLimitations: [{ id: "commitment.book-slot-requires-availability", reasons: ["insufficient-coverage"], coverage: [{ capability: "api.condition", state: "partial" }] }],
};

test("the overview renders counts and witness state", () => {
  const html = renderReviewOverview(review);
  assert.ok(html.includes("Slotkeeper"));
  assert.ok(html.includes("2</strong> realized"));
  assert.ok(html.includes("0</strong> missing"));
  assert.ok(html.includes("1</strong> unverified"));
  assert.ok(html.includes("witness current"));
  assert.ok(html.includes("Booking must be atomic"));
});

test("commitment cards render with explicit verdict chips", () => {
  const card = review.groups[0].cards[0];
  assert.ok(verdictChip("holds").includes("verdict-holds"));
  const html = renderCompactCard(card, false);
  assert.ok(html.includes("book-slot-creates-booking"));
  assert.ok(html.includes("behavior.book-slot"));
});

test("builder testimony is visually separate from independently observed evidence", () => {
  const html = renderCardDetail(review.groups[0].cards[0]);
  assert.ok(html.includes("Builder testimony"));
  assert.ok(html.includes("Independently observed"));
  assert.ok(html.includes("testimony"));
  assert.ok(html.includes("binding.book-slot-operation"));
  assert.ok(html.includes("POST /api/bookings"));
  assert.ok(html.includes("claim"));
});

test("the reading order renders numbered evidence steps", () => {
  const html = renderCardDetail(review.groups[0].cards[0]);
  assert.ok(html.includes("Suggested code-reading order"));
  assert.ok(html.includes("interface"));
  assert.ok(html.includes("backend/app/main.py"));
});

test("coverage limitations are listed with reasons and states", () => {
  const html = renderCoverageLimitations(review);
  assert.ok(html.includes("What Varai could not determine"));
  assert.ok(html.includes("book-slot-requires-availability"));
  assert.ok(html.includes("insufficient-coverage"));
  assert.ok(html.includes("api.condition"));
});
