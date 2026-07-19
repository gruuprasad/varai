import assert from "node:assert/strict";
import test from "node:test";
import { bindBehaviorReferents } from "../../src/scanners/lift/bindings.js";

function registry(values) {
  return {
    get: (id) => values.find((item) => item.id === id) ?? null,
    named: (name) => values.filter((item) => item.name === name),
  };
}

test("binding counts distinct behaviors only after declaration resolution", () => {
  const declaration = { id: "python:domain.py:Document", name: "Document" };
  const behavior = (path) => ({ door: { method: "POST", path }, reads: [], writes: [{ target: "Document", evidence: { file: "routes.py", line: 1 } }] });
  const result = bindBehaviorReferents([behavior("/one"), behavior("/two")], registry([declaration]));
  assert.equal(result.convergence.get(declaration.id).size, 2);
  assert.ok(result.behaviors.every((item) => item.writes[0].targetDeclarationId === declaration.id));
});

test("name-only collisions remain ambiguous", () => {
  const values = [
    { id: "python:a.py:Record", name: "Record" },
    { id: "python:b.py:Record", name: "Record" },
  ];
  const result = bindBehaviorReferents([
    { door: { method: "POST", path: "/records" }, reads: [], writes: [{ target: "Record", evidence: { file: "routes.py", line: 1 } }] },
  ], registry(values));
  assert.equal(result.behaviors[0].writes[0].bindingState, "ambiguous");
  assert.equal(result.diagnostics[0].code, "ambiguous-effect-target");
});
