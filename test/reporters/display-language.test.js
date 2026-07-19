import assert from "node:assert/strict";
import test from "node:test";
import {
  RELATION_LABELS, KIND_LABELS, CLAIM_STATE_LABELS,
  kindLabel, claimStateLabel, displayLanguage,
} from "../../src/reporters/display-language.js";

test("display language covers every kernel relation and stays plain", () => {
  for (const relation of ["contains", "exposes", "offers", "triggered_by", "invokes",
    "accepts", "produces", "requires", "available_when", "reads", "changes", "creates",
    "removes", "succeeds_with", "fails_with", "navigates_to", "emits", "has_field",
    "relates_to", "stored_in"]) {
    assert.equal(typeof RELATION_LABELS[relation], "string", relation);
  }
  assert.equal(KIND_LABELS.aggregate, "in-memory model");
  assert.equal(KIND_LABELS.entity, "stored record");
  assert.equal(KIND_LABELS.contract, "data contract");
  assert.equal(KIND_LABELS.surface, "panel");
  assert.equal(kindLabel("operation"), "API operation");
  assert.equal(kindLabel("unmapped_kind"), "unmapped_kind");
  assert.equal(claimStateLabel("observed"), "");
  assert.equal(claimStateLabel("unverified"), "not verified");
  assert.equal(claimStateLabel("ambiguous"), "ambiguous — multiple candidates matched");
  const language = displayLanguage();
  assert.deepEqual(Object.keys(language).sort(), ["claimStates", "kinds", "relations"]);
});
