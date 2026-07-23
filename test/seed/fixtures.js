// Shared seed fixtures for seed tests. Not a test file: importing a *.test.js
// module re-registers its tests in the importer's process.

export function slotkeeperDraft() {
  return {
    formatVersion: 1,
    system: { id: "slotkeeper", name: "Slotkeeper" },
    concepts: [
      { id: "actor.member", role: "actor", name: "Member" },
      { id: "behavior.book-slot", role: "behavior", name: "Book Slot" },
      { id: "resource.slot", role: "resource", name: "Slot" },
      { id: "resource.booking", role: "resource", name: "Booking" },
      { id: "condition.slot-available", role: "condition", name: "Slot is available" },
      { id: "outcome.slot-unavailable", role: "outcome", name: "Slot unavailable failure" },
    ],
    commitments: [
      { id: "commitment.booking-requires-availability", source: "behavior.book-slot", relation: "requires", target: { literal: "slot is available" } },
      { id: "commitment.booking-creates-booking", source: "behavior.book-slot", relation: "creates", target: { concept: "resource.booking" } },
      { id: "commitment.booking-changes-slot", source: "behavior.book-slot", relation: "changes", target: { concept: "resource.slot" } },
      { id: "commitment.booking-fails-unavailable", source: "behavior.book-slot", relation: "fails_with", target: { literal: "slot unavailable" } },
    ],
    context: [
      { id: "context.atomicity", text: "Booking must be atomic; recorded as human-owned until runtime evidence can support it." },
    ],
  };
}
