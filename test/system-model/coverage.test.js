import assert from "node:assert/strict";
import test from "node:test";
import { mergeCoverageState } from "../../src/system-model/merge.js";

test("coverage state merge is conservative", () => {
  assert.equal(mergeCoverageState(["analyzed", "analyzed"]), "analyzed");
  assert.equal(mergeCoverageState(["unsupported", "unsupported"]), "unsupported");
  assert.equal(mergeCoverageState(["analyzed", "unsupported"]), "partial");
  assert.equal(mergeCoverageState(["partial", "analyzed"]), "partial");
  assert.equal(mergeCoverageState(["failed", "analyzed"]), "failed");
});
