import assert from "node:assert/strict";
import test from "node:test";
import { collectChangedClaimIds } from "../../src/ui/changes.js";

test("collectChangedClaimIds returns an empty set for a missing diff", () => {
  assert.deepEqual(collectChangedClaimIds(undefined), new Set());
  assert.deepEqual(collectChangedClaimIds(null), new Set());
});

test("collectChangedClaimIds gathers claim ids across added, removed, and changed", () => {
  const ids = collectChangedClaimIds({
    claims: {
      added: [{ id: "claim:a" }],
      removed: [{ id: "claim:b" }],
      // A changed claim carries before/after; the id that matters for
      // highlighting is the one in the current model.
      changed: [{ before: { id: "claim:c-old" }, after: { id: "claim:c" } }],
    },
  });
  assert.deepEqual([...ids].sort(), ["claim:a", "claim:b", "claim:c"]);
});
