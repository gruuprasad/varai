import assert from "node:assert/strict";
import test from "node:test";
import { checkRealization, RELATION_CAPABILITIES } from "../../src/reconciliation/schema.js";
import { SEED_RELATIONS, RECORDED_ONLY_RELATIONS } from "../../src/seed/schema.js";

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

test("every seed relation is either checkable or explicitly recorded-only", () => {
  for (const relation of SEED_RELATIONS) {
    const checkable = relation in RELATION_CAPABILITIES;
    const recorded = RECORDED_ONLY_RELATIONS.includes(relation);
    assert.ok(checkable !== recorded,
      `${relation} must be either checkable (has capabilities) xor recorded-only, not both/neither`);
  }
});

test("realization v1 still validates without surfaceBindings", () => {
  const result = checkRealization(realizationWith("binding.book"), { seed });
  assert.equal(result.valid, true, result.problems.map((p) => p.message).join("; "));
});

test("realization v2 with surfaceBindings validates", () => {
  const realization = {
    formatVersion: 2,
    seedHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    bindings: [
      { id: "binding.book", concept: "behavior.book", artifact: { lens: "api", kind: "operation", key: "POST /bookings" } },
    ],
    surfaceBindings: [
      {
        id: "surface-binding.withdraw-request-api",
        surface: "surface.withdraw-request-api",
        artifact: { lens: "api", kind: "operation", key: "POST /api/purchase-requests/{id}/withdraw" },
      },
    ],
    witnesses: [],
  };
  const result = checkRealization(realization);
  assert.equal(result.valid, true, result.problems.map((p) => p.message).join("; "));
});

test("realization v2 rejects bad surface-binding ids and missing artifact selectors", () => {
  const realization = {
    formatVersion: 2,
    seedHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    bindings: [],
    surfaceBindings: [
      {
        id: "binding.not-a-surface-binding",
        surface: "surface.withdraw-request-api",
        artifact: { lens: "api", kind: "operation", key: "POST /x" },
      },
      {
        id: "surface-binding.missing-artifact",
        surface: "surface.other",
      },
    ],
    witnesses: [],
  };
  const codes = checkRealization(realization).problems.map((p) => p.code);
  assert.ok(codes.includes("invalid-id-format"));
  assert.ok(codes.includes("invalid-artifact"));
});
