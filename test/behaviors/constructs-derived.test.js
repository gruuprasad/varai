import assert from "node:assert/strict";
import test from "node:test";
import { _deriveDerived } from "../../src/scanners/behaviors/constructs.js";

test("derived lists read-only members' gives, skips mutating members", () => {
  const bundle = {
    subject: { label: "building-model document" },
    behaviors: [
      { writes: [], gives: [{ schema: "QuantitiesResponse" }] },
      { writes: [], gives: [{ schema: "ElevationResponse" }] },
      { writes: [{ medium: "file" }], gives: [{ schema: "RenderResponse" }] },
    ],
  };
  _deriveDerived(bundle);
  assert.deepEqual(bundle.derived.sort(), ["elevation", "quantities"]);
});
