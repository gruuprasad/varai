import assert from "node:assert/strict";
import test from "node:test";
import { buildBehaviorCoverage } from "../../src/scanners/lift/behavior-coverage.js";

const traced = {
  door: { method: "post", path: "/bookings", evidence: { file: "routes.py", line: 10 } },
  handler: { symbol: "book" },
  untraced: [],
};

const SCOPE = { kind: "element", subsystemKey: "api", elementKind: "operation", key: "POST /bookings" };

test("a completed FastAPI body trace emits element-scoped analyzed effect coverage", () => {
  const coverage = buildBehaviorCoverage([traced], { authVocabulary: true });
  assert.deepEqual(coverage.map((item) => [item.capability, item.scope, item.state]), [
    ["api.effect", SCOPE, "analyzed"],
    ["api.failure", SCOPE, "analyzed"],
    ["api.authorization", SCOPE, "analyzed"],
    ["application.state", SCOPE, "analyzed"],
  ]);
});

test("an unresolved body trace stays partial with its reason", () => {
  const coverage = buildBehaviorCoverage([{ ...traced, untraced: [{ reason: "unresolved function" }] }], { authVocabulary: true });
  for (const capability of ["api.effect", "api.failure"]) {
    const item = coverage.find((record) => record.capability === capability);
    assert.equal(item.state, "partial", capability);
    assert.ok(item.details.includes("unresolved function"), capability);
  }
  const state = coverage.find((record) => record.capability === "application.state");
  assert.equal(state.state, "partial", "application.state");
  assert.ok(state.details.some((detail) => detail.includes("State analysis incomplete")), "application.state");
  // Signature-level analysis is independent of the body trace.
  const authorization = coverage.find((record) => record.capability === "api.authorization");
  assert.equal(authorization.state, "analyzed");
});

test("api.authorization stays partial without recognizable guard vocabulary", () => {
  const coverage = buildBehaviorCoverage([traced], { authVocabulary: false });
  const authorization = coverage.find((item) => item.capability === "api.authorization");
  assert.equal(authorization.state, "partial");
  assert.ok(authorization.details.some((detail) => detail.includes("No recognizable authorization")));
});

test("application.state stays partial when a state assignment lacks from-state evidence", () => {
  const unguarded = {
    ...traced,
    states: [{ resource: "Booking", to: "confirmed", from: null, guardRecognized: false }],
  };
  const coverage = buildBehaviorCoverage([unguarded], { authVocabulary: true });
  const state = coverage.find((item) => item.capability === "application.state");
  assert.equal(state.state, "partial");
});

test("application.state is analyzed when every assignment carries from-state evidence", () => {
  const guarded = {
    ...traced,
    states: [{ resource: "Booking", to: "confirmed", from: "pending", guardRecognized: true }],
  };
  const coverage = buildBehaviorCoverage([guarded], { authVocabulary: true });
  const state = coverage.find((item) => item.capability === "application.state");
  assert.equal(state.state, "analyzed");
});
