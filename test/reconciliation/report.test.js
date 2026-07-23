import assert from "node:assert/strict";
import test from "node:test";
import { renderCheckText } from "../../src/reconciliation/report.js";

const report = {
  system: { name: "Slotkeeper" },
  seedHash: "sha256:0123456789abcdef",
  ratified: true,
  realization: { present: true, seedHash: "sha256:0123456789abcdef", stale: false, builder: null },
  commitments: [
    {
      id: "commitment.book-creates-booking", source: "behavior.book", relation: "creates",
      target: { concept: "resource.booking" }, bindingState: "resolved", verdict: "holds",
      reasons: [], bindings: [{ id: "binding.book", concept: "behavior.book", state: "resolved", reason: null, elementIds: ["el.op"] }],
      claimIds: ["claim:abc"], evidence: [{ file: "main.py", line: 5, symbol: "book" }], implementationPath: [], coverage: [],
    },
    {
      id: "commitment.book-requires-avail", source: "behavior.book", relation: "requires",
      target: { literal: "slot is available" }, bindingState: "resolved", verdict: "cannot_verify",
      reasons: ["insufficient-coverage"], bindings: [], claimIds: [], evidence: [], implementationPath: [],
      coverage: [{ capability: "api.condition", scopeId: "s", state: "partial" }],
    },
  ],
  context: [{ id: "context.atomicity", text: "Booking must be atomic." }],
  summary: { total: 2, holds: 1, violated: 0, cannotVerify: 1, notCheckable: 0,
    binding: { resolved: 1, unbound: 0, ambiguous: 0, stale: 0 } },
};

test("the check report reads in plain English, not kernel jargon", () => {
  const text = renderCheckText(report, { model: { elements: [{ id: "el.op", name: "POST /bookings" }] } });
  assert.ok(text.includes("confirmed"), "uses 'confirmed' for holds");
  assert.ok(text.includes("couldn't tell"), "uses \"couldn't tell\" for cannot_verify");
  assert.ok(text.includes("couldn't analyze this fully"), "translates the reason code");
  assert.ok(!/\bholds\b|VIOLATED|cannot_verify|not_checkable/.test(text), "no raw verdict enums");
  assert.ok(!/reconciliation/i.test(text) || text.includes("check"), "no 'reconciliation' header jargon");
  assert.ok(text.includes("approved"), "seed status reads 'approved', not 'ratified'");
  assert.ok(!/ratified/.test(text), "the word ratified never appears");
});
