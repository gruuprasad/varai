import assert from "node:assert/strict";
import test from "node:test";
import { checkRealization } from "../../src/reconciliation/schema.js";

const seed = {
  formatVersion: 1,
  system: { id: "demo", name: "Demo" },
  concepts: [
    { id: "behavior.book", role: "behavior", name: "Book" },
    { id: "behavior.cancel", role: "behavior", name: "Cancel" },
    { id: "resource.booking", role: "resource", name: "Booking" },
  ],
  commitments: [
    { id: "commitment.book-creates-booking", source: "behavior.book", relation: "creates", target: { concept: "resource.booking" } },
  ],
  context: [],
};

function realizationWith(sourceBinding) {
  return {
    formatVersion: 1,
    seedHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    bindings: [
      { id: "binding.book", concept: "behavior.book", artifact: { lens: "api", kind: "operation", key: "POST /bookings" } },
      { id: "binding.cancel", concept: "behavior.cancel", artifact: { lens: "api", kind: "operation", key: "POST /cancel" } },
    ],
    witnesses: [
      { commitment: "commitment.book-creates-booking", sourceBinding, target: { concept: "resource.booking" } },
    ],
  };
}

test("a witness whose source binding names a different concept is rejected", () => {
  const result = checkRealization(realizationWith("binding.cancel"), { seed });
  assert.equal(result.valid, false);
  assert.ok(result.problems.some((p) => p.code === "witness-source-mismatch"),
    "the wrong-source witness is flagged");
});

test("a witness whose source binding matches the commitment source is accepted", () => {
  const result = checkRealization(realizationWith("binding.book"), { seed });
  assert.ok(!result.problems.some((p) => p.code === "witness-source-mismatch"),
    "the correct-source witness raises no source mismatch");
});
