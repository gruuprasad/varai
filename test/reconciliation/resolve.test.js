import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { readSeed } from "../../src/seed/store.js";
import { resolveBindings } from "../../src/reconciliation/resolve.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";

const fixture = path.resolve("test/fixtures/semantic-assembly-structural");
const modelPromise = scanRepo(fixture, { jobs: 1, cache: false }).then((scan) => scan.model);
const seed = readSeed(fixture).seed;
const seedHash = readSeed(fixture).contentHash;
const { realization } = readRealization(fixture, { seed });

function withBindings(bindings) {
  return { formatVersion: 1, seedHash, bindings, witnesses: [] };
}

test("a lens/kind/key selector resolves the operation uniquely", async () => {
  const model = await modelPromise;
  const operation = model.elements.find((item) => item.name.startsWith("PUT /api/v1"));
  const resolution = resolveBindings(model, withBindings([
    { id: "binding.op", concept: "behavior.put-structural-type", artifact: { lens: "api", kind: "operation", key: operation.key } },
  ]), seedHash);
  const record = resolution.get("binding.op");
  assert.equal(record.state, "resolved");
  assert.deepEqual(record.elementIds, [operation.id]);
});

test("the key selector falls back to the element display name", async () => {
  const model = await modelPromise;
  const action = model.elements.find((item) => item.name === "StructuralBasisTypesPanel Apply change");
  assert.notEqual(action.key, action.name, "fixture action key differs from its display name");
  const resolution = resolveBindings(model, withBindings([
    { id: "binding.action", concept: "behavior.apply-change", artifact: { lens: "ui", kind: "action", key: action.name } },
  ]), seedHash);
  assert.equal(resolution.get("binding.action").state, "resolved");
  assert.deepEqual(resolution.get("binding.action").elementIds, [action.id]);
});

test("a wrong lens makes an otherwise correct selector stale", async () => {
  const model = await modelPromise;
  const operation = model.elements.find((item) => item.name.startsWith("PUT /api/v1"));
  const resolution = resolveBindings(model, withBindings([
    { id: "binding.op", concept: "behavior.put-structural-type", artifact: { lens: "ui", kind: "operation", key: operation.key } },
  ]), seedHash);
  assert.equal(resolution.get("binding.op").state, "stale");
  assert.equal(resolution.get("binding.op").reason, "artifact-not-found");
});

test("source file and symbol resolve as a fallback selector", async () => {
  const model = await modelPromise;
  const aggregate = model.elements.find((item) => item.name === "BuildingModelDocument");
  const resolution = resolveBindings(model, withBindings([
    { id: "binding.aggregate", concept: "resource.building-model-document", artifact: { kind: "aggregate", source: { file: "domain.py", symbol: "BuildingModelDocument" } } },
  ]), seedHash);
  assert.equal(resolution.get("binding.aggregate").state, "resolved");
  assert.deepEqual(resolution.get("binding.aggregate").elementIds, [aggregate.id]);
});

test("a selector matching more than one element is ambiguous", async () => {
  const model = await modelPromise;
  const operation = model.elements.find((item) => item.name.startsWith("PUT /api/v1"));
  const widened = structuredClone(model);
  widened.elements.push({ ...operation, id: "element:duplicate-for-ambiguity" });
  const resolution = resolveBindings(widened, withBindings([
    { id: "binding.op", concept: "behavior.put-structural-type", artifact: { lens: "api", kind: "operation", key: operation.key } },
  ]), seedHash);
  const record = resolution.get("binding.op");
  assert.equal(record.state, "ambiguous");
  assert.equal(record.reason, "selector-ambiguous");
  assert.equal(record.elementIds.length, 2);
});

test("a selector naming an absent artifact is stale", async () => {
  const model = await modelPromise;
  const resolution = resolveBindings(model, withBindings([
    { id: "binding.ghost", concept: "behavior.put-structural-type", artifact: { lens: "api", kind: "operation", key: "DELETE /nope" } },
  ]), seedHash);
  assert.equal(resolution.get("binding.ghost").state, "stale");
  assert.equal(resolution.get("binding.ghost").reason, "artifact-not-found");
});

test("a stale seed hash invalidates every builder binding", async () => {
  const model = await modelPromise;
  const stale = { ...realization, seedHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" };
  const resolution = resolveBindings(model, stale, seedHash);
  assert.ok(resolution.size > 0);
  for (const record of resolution.values()) {
    assert.equal(record.state, "stale");
    assert.equal(record.reason, "seed-hash-mismatch");
    assert.deepEqual(record.elementIds, []);
  }
});

test("the checked-in fixture realization resolves every binding", async () => {
  const model = await modelPromise;
  const resolution = resolveBindings(model, realization, seedHash);
  assert.equal(resolution.size, realization.bindings.length);
  for (const record of resolution.values()) {
    assert.equal(record.state, "resolved", `${record.id} should resolve`);
    assert.equal(record.elementIds.length, 1);
  }
});
