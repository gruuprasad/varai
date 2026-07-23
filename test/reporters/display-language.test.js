import assert from "node:assert/strict";
import test from "node:test";
import {
  RELATION_LABELS, KIND_LABELS, CLAIM_STATE_LABELS,
  kindLabel, claimStateLabel, displayLanguage,
  verdictLabel, bindingStateLabel, reasonLabel, SEED_VOCAB,
} from "../../src/reporters/display-language.js";
import { RELATIONSHIPS } from "../../src/system-model/schema.js";
import { VERDICTS, BINDING_STATES } from "../../src/reconciliation/schema.js";

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

test("every verdict enum has a plain-English label with no jargon", () => {
  const plain = VERDICTS.map(verdictLabel);
  assert.deepEqual(plain, ["confirmed", "missing", "couldn't tell", "noted"]);
  for (const label of plain) {
    assert.ok(!/verify|checkable|holds|violated/.test(label), `"${label}" still reads like jargon`);
  }
});

test("every binding state has a plain-English label", () => {
  for (const state of BINDING_STATES) {
    const label = bindingStateLabel(state);
    assert.notEqual(label, state, `binding state ${state} must be translated`);
  }
  assert.equal(bindingStateLabel("stale"), "out of date");
});

test("reason codes translate, and unknown codes fall back to the code", () => {
  assert.equal(reasonLabel("insufficient-coverage"), "couldn't analyze this fully");
  assert.equal(reasonLabel("no-checker-semantics"), "varai can't check this kind of rule yet");
  assert.equal(reasonLabel("some-unmapped-code"), "some-unmapped-code");
});

test("approval vocabulary avoids the word ratified", () => {
  assert.equal(SEED_VOCAB.approved, "approved");
  assert.ok(!Object.values(SEED_VOCAB).some((w) => /ratif/i.test(w)));
});
