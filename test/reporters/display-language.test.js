import assert from "node:assert/strict";
import test from "node:test";
import {
  RELATION_LABELS, KIND_LABELS, CLAIM_STATE_LABELS,
  kindLabel, claimStateLabel, displayLanguage,
} from "../../src/reporters/display-language.js";
import { RELATIONSHIPS } from "../../src/system-model/schema.js";

test("display language covers every kernel relation and stays plain", () => {
  // Verify against the canonical schema, not a hardcoded list
  for (const relation of RELATIONSHIPS) {
    assert.equal(typeof RELATION_LABELS[relation], "string", `missing label for ${relation}`);
    assert.ok(RELATION_LABELS[relation].length > 0, `empty label for ${relation}`);
  }
  // No extra keys beyond what the schema declares
  assert.deepEqual(
    Object.keys(RELATION_LABELS).sort(),
    [...RELATIONSHIPS].sort(),
    "RELATION_LABELS keys must exactly match schema RELATIONSHIPS",
  );
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
