import assert from "node:assert/strict";
import test from "node:test";
import { renderVerificationPlan } from "../../src/ui/verification-plan-view.js";

test("verification plan explains methods and limits without claiming outcomes", () => {
  const html = renderVerificationPlan({
    obligations: [
      { id: "commitment.owner-creates", title: "Owner creates an item", method: "deterministic", roles: ["backend", "verification"], blocking: true },
      { id: "scenario.owner-creates", title: "Owner creates", method: "runtime", roles: ["product"], blocking: true },
      { id: "context.quality", title: "The result is clear", method: "recorded_only", roles: ["product"], blocking: false },
    ],
  });
  assert.match(html, /How Varai will check this/);
  assert.match(html, /deterministic check/);
  assert.match(html, /runtime scenario/);
  assert.match(html, /not machine-checked/);
  assert.doesNotMatch(html, />holds</i);
});

test("empty verification plan stays out of the conversation", () => {
  assert.equal(renderVerificationPlan(null), "");
  assert.equal(renderVerificationPlan({ obligations: [] }), "");
});
