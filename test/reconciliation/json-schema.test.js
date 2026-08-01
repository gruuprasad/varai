import assert from "node:assert/strict";
import test from "node:test";
import { checkJsonSchema, realizationJsonSchema, runtimeMapJsonSchema, emitHandoffSchemas } from "../../src/reconciliation/json-schema.js";
import { checkRealization } from "../../src/reconciliation/schema.js";
import { checkRuntimeMap } from "../../src/runtime/validate.js";
import { PARITY_FIXTURES } from "../../src/reconciliation/schema-fixtures.js";

test("emitted handoff schemas are standalone draft-07 documents", () => {
  const schemas = emitHandoffSchemas();
  assert.equal(schemas.realization.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(schemas.realization.type, "object");
  assert.deepEqual(schemas.realization.required, ["formatVersion", "seedHash"]);
  assert.equal(schemas.runtimeMap.type, "object");
  assert.deepEqual(schemas.runtimeMap.required, ["formatVersion", "seedHash"]);
  assert.ok(schemas.realization.properties.bindings.items.required.includes("artifact"));
  assert.ok(schemas.runtimeMap.properties.operations.items.required.includes("behavior"));
});

test("realization structural parity: schema and JS validator agree on shape", () => {
  for (const fixture of PARITY_FIXTURES) {
    const schema = fixture.kind === "realization" ? realizationJsonSchema() : runtimeMapJsonSchema();
    const structural = checkJsonSchema(fixture.doc, schema);
    assert.equal(structural.valid, fixture.expectValid, `${fixture.kind}: ${fixture.name}`);
    if (!fixture.expectValid) {
      const js = fixture.kind === "realization"
        ? checkRealization(fixture.doc, {})
        : checkRuntimeMap(fixture.doc, {});
      assert.equal(js.valid, false, `JS validator agrees: ${fixture.kind}: ${fixture.name}`);
    }
  }
});

test("every shape-valid fixture passes the JS validators except declared security rules", () => {
  for (const fixture of PARITY_FIXTURES) {
    if (!fixture.expectValid) continue;
    const js = fixture.kind === "realization"
      ? checkRealization(fixture.doc, {})
      : checkRuntimeMap(fixture.doc, {});
    if (!js.valid) {
      // JSON Schema covers shape only; the JS validator adds security and
      // cross-field rules (e.g. loopback base URL). Name the rule explicitly.
      const codes = js.problems.map((problem) => problem.code);
      assert.ok(codes.every((code) => code === "non-loopback-base-url"),
        `${fixture.kind}: ${fixture.name} rejects only with non-structural rules, got ${codes.join(",")}`);
    }
  }
});

test("structural checker catches type, pattern, and unknown-field violations", () => {
  const schema = realizationJsonSchema();
  const seedHash = "sha256:" + "0".repeat(64);
  const base = { formatVersion: 2, seedHash };
  assert.equal(checkJsonSchema({ ...base, formatVersion: "2" }, schema).valid, false, "wrong type");
  assert.equal(checkJsonSchema({ ...base, seedHash: "nope" }, schema).valid, false, "bad pattern");
  assert.equal(checkJsonSchema({ ...base, verdicts: [] }, schema).valid, false, "unknown field");
  assert.equal(checkJsonSchema({ ...base, bindings: "nope" }, schema).valid, false, "wrong collection type");
  assert.equal(checkJsonSchema(base, schema).valid, true, "minimal valid shape");
});
