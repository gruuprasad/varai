import assert from "node:assert/strict";
import test from "node:test";
import { claimId, elementId } from "../../src/system-model/identity.js";
import { createSystemModel } from "../../src/system-model/canonicalize.js";

test("element identity ignores source movement, display name, and qualifiers", () => {
  const base = { subsystemId: "subsystem:api", kind: "operation", key: "GET /projects" };
  assert.equal(
    elementId({ ...base, name: "Projects", evidence: [{ file: "a.py" }] }),
    elementId({ ...base, name: "List Projects", evidence: [{ file: "b.py" }], qualifiers: { delivery: "sync" } }),
  );
});

test("claim identity tracks qualifier changes but distinguishes unslotted targets", () => {
  const base = { sourceId: "element:one", relation: "produces" };
  const a = claimId({ ...base, target: { kind: "literal", valueType: "contract", value: "A" }, qualifiers: {} });
  const qualified = claimId({ ...base, target: { kind: "literal", valueType: "contract", value: "A" }, qualifiers: { delivery: "stream" } });
  const b = claimId({ ...base, target: { kind: "literal", valueType: "contract", value: "B" }, qualifiers: {} });
  assert.equal(a, qualified);
  assert.notEqual(a, b);
});

test("a semantic slot keeps identity stable across target replacement", () => {
  const base = { sourceId: "element:one", relation: "produces", slot: "response" };
  assert.equal(
    claimId({ ...base, target: { kind: "literal", valueType: "contract", value: "A" } }),
    claimId({ ...base, target: { kind: "literal", valueType: "contract", value: "B" } }),
  );
});

test("incompatible objects with one semantic identity emit a diagnostic", () => {
  const model = createSystemModel({
    systemName: "fixture",
    subsystems: [{ key: "ui", lens: "ui", name: "UI", qualifiers: {}, evidence: [] }],
    elements: [
      { subsystemKey: "ui", key: "dialog", kind: "component", roles: ["interface"], name: "First", qualifiers: {}, evidence: [{ file: "a.tsx" }], observationMethod: "ast", claimState: "observed", capability: "ui.component" },
      { subsystemKey: "ui", key: "dialog", kind: "component", roles: ["interface"], name: "Second", qualifiers: {}, evidence: [{ file: "b.tsx" }], observationMethod: "ast", claimState: "observed", capability: "ui.component" },
    ],
  });
  assert.ok(model.diagnostics.some((item) => item.code === "semantic-identity-collision"));
});
