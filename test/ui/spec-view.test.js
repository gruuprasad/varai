import { test } from "node:test";
import assert from "node:assert/strict";
import { specSections, verdictById, ROLE_ORDER } from "../../src/ui/spec-view.js";
import { CONCEPT_ROLES } from "../../src/seed/schema.js";

const seed = {
  system: { id: "slotkeeper", name: "Slotkeeper" },
  concepts: [
    { id: "resource.booking", role: "resource", name: "Booking" },
    { id: "behavior.book-slot", role: "behavior", name: "Book Slot" },
    { id: "actor.member", role: "actor", name: "Member" },
  ],
  commitments: [
    { id: "commitment.member-performs-book", source: "actor.member", relation: "performs", target: { concept: "behavior.book-slot" } },
    { id: "commitment.book-slot-creates-booking", source: "behavior.book-slot", relation: "creates", target: { concept: "resource.booking" } },
    { id: "commitment.book-slot-fails-409", source: "behavior.book-slot", relation: "fails_with", target: { literal: "409" } },
  ],
  context: [],
};

const review = {
  groups: [
    { concept: "behavior.book-slot", cards: [
      { id: "commitment.book-slot-creates-booking", verdict: "holds" },
      { id: "commitment.book-slot-fails-409", verdict: "cannot_verify" },
    ] },
    { concept: "actor.member", cards: [
      { id: "commitment.member-performs-book", verdict: "not_checkable" },
    ] },
  ],
};

test("the browser-safe role list matches the seed vocabulary", () => {
  // spec-view.js cannot import ../seed/schema.js (the server serves only
  // /reporters/ to the browser), so this is the guard against the copy drifting.
  assert.deepEqual([...ROLE_ORDER], [...CONCEPT_ROLES]);
});

test("every concept appears, ordered by role, with its own requirements", () => {
  const sections = specSections(seed, review);
  assert.deepEqual(sections.map((section) => section.concept.id),
    ["actor.member", "behavior.book-slot", "resource.booking"]);

  const [member, bookSlot, booking] = sections;
  assert.deepEqual(member.requirements.map((req) => req.text), ["can Book Slot"]);
  assert.deepEqual(bookSlot.requirements.map((req) => req.text),
    ["creates Booking", "fails with 409"]);
  // A concept that is only ever a target still gets a row, so nothing is hidden.
  assert.equal(booking.requirements.length, 0);
  assert.equal(booking.referencedBy, 1);
});

test("verdicts join by commitment id; unchecked requirements stay null", () => {
  const verdicts = verdictById(review);
  assert.equal(verdicts.get("commitment.book-slot-creates-booking"), "holds");
  assert.equal(verdicts.get("commitment.book-slot-fails-409"), "cannot_verify");

  const sections = specSections(seed, review);
  const bookSlot = sections.find((section) => section.concept.id === "behavior.book-slot");
  assert.deepEqual(bookSlot.requirements.map((req) => req.verdict), ["holds", "cannot_verify"]);

  const noReview = specSections(seed, null);
  assert.equal(noReview[0].requirements[0].verdict, null);
});
