import assert from "node:assert/strict";
import test from "node:test";
import { buildBehaviorCoverage } from "../../src/scanners/lift/behavior-coverage.js";

const traced = {
  door: { method: "post", path: "/bookings", evidence: { file: "routes.py", line: 10 } },
  handler: { symbol: "book" },
  untraced: [],
};

test("a completed FastAPI body trace emits element-scoped analyzed effect coverage", () => {
  const coverage = buildBehaviorCoverage([traced]);
  assert.deepEqual(coverage.map((item) => [item.capability, item.scope, item.state]), [
    ["api.effect", { kind: "element", subsystemKey: "api", elementKind: "operation", key: "POST /bookings" }, "analyzed"],
    ["api.failure", { kind: "element", subsystemKey: "api", elementKind: "operation", key: "POST /bookings" }, "analyzed"],
  ]);
});

test("an unresolved body trace stays partial with its reason", () => {
  const coverage = buildBehaviorCoverage([{ ...traced, untraced: [{ reason: "unresolved function" }] }]);
  assert.ok(coverage.every((item) => item.state === "partial"));
  assert.ok(coverage.every((item) => item.details.includes("unresolved function")));
});
