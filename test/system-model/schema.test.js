import assert from "node:assert/strict";
import test from "node:test";
import { createSystemModel } from "../../src/system-model/canonicalize.js";
import { validateSystemModel } from "../../src/system-model/validate.js";
import { createLensRegistry } from "../../src/system-model/lenses.js";

function customModel() {
  return createSystemModel({
    systemName: "fixture",
    subsystems: [{ key: "protocol", lens: "protocol", name: "Protocol", qualifiers: {}, evidence: [] }],
    elements: [{
      subsystemKey: "protocol", key: "ping", kind: "message", roles: ["interface"], name: "Ping",
      qualifiers: {}, evidence: [{ file: "protocol.txt", line: 1 }], observationMethod: "manifest",
      claimState: "observed", capability: "protocol.message",
    }],
  });
}

test("kernel validation accepts a synthetic injected lens", () => {
  const registry = createLensRegistry([{ id: "protocol", label: "Protocol", elementKinds: ["message"] }]);
  assert.equal(validateSystemModel(customModel(), { lensRegistry: registry }).elements[0].kind, "message");
});

test("kernel validation rejects unregistered lens vocabulary", () => {
  assert.throws(() => validateSystemModel(customModel()), /unknown lens protocol/);
});

test("kernel validation rejects nested or unregistered qualifiers", () => {
  const model = createSystemModel({
    systemName: "fixture",
    subsystems: [{ key: "ui", lens: "ui", name: "UI", qualifiers: {}, evidence: [] }],
    elements: [{
      subsystemKey: "ui", key: "screen", kind: "screen", roles: ["interface"], name: "Screen",
      qualifiers: { framework: "react" }, evidence: [], observationMethod: "ast", claimState: "observed", capability: "ui.screen",
    }],
  });
  assert.throws(() => validateSystemModel(model), /qualifier framework is not registered/);
});
