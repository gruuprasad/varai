import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { diffSystemModels } from "../../src/system-model/diff.js";
import { systemPaths } from "../../src/system-model/projections/index.js";
import { bindApplicationOperation } from "../../src/scanners/lift/application-operations.js";

const fixture = (name) => path.resolve(`test/fixtures/application-operation/${name}`);

async function scan(name, options = {}) {
  return (await scanRepo(fixture(name), {
    cache: false,
    jobs: 1,
    systemName: "application-operation-fixture",
    ...options,
  })).model;
}

function named(model, name) {
  return model.elements.find((item) => item.name === name);
}

function claim(model, source, relation, target) {
  return model.claims.find((item) => item.sourceId === source.id &&
    item.relation === relation && item.target.kind === "reference" && item.target.id === target.id);
}

test("stable typed aggregate-member operations lift into the Application lens", async () => {
  const model = await scan("after");
  const api = named(model, "POST /catalog/items");
  const operation = named(model, "Create Item");
  const aggregate = named(model, "CatalogDocument");
  const resource = named(model, "Item");

  assert.ok(api && operation && aggregate && resource);
  assert.equal(operation.subsystemId, model.subsystems.find((item) => item.lens === "application").id);
  assert.ok(claim(model, api, "invokes", operation));
  assert.ok(claim(model, operation, "creates", resource));
  assert.ok(claim(model, operation, "changes", aggregate));
  assert.ok(claim(model, aggregate, "contains", resource));
  assert.ok(claim(model, operation, "creates", resource).implementationPath.length >= 2);
  assert.ok(claim(model, operation, "creates", resource).evidence.some((item) =>
    item.file === "domain.py" && item.line === 17), "result identity remains visible as effect evidence");
  assert.ok(model.coverage.some((item) => item.capability === "application.operation" && item.state === "partial"));
  assert.ok(model.coverage.some((item) => item.capability === "application.effect" && item.state === "partial"));

  const pathView = systemPaths(model);
  const path = pathView.paths.find((item) => item.steps.some((step) => step.behaviorId === operation.id));
  assert.ok(path);
  assert.equal(path.terminalBehaviorId, operation.id);
  assert.equal(path.completeness, "closed");
  assert.ok(path.subjectIds.includes(resource.id));
  assert.ok(path.subjectIds.includes(aggregate.id));
});

test("aggregate-member operation appears as a meaningful semantic diff", async () => {
  const before = await scan("before");
  const after = await scan("after");
  const diff = diffSystemModels(before, after);
  const operation = named(after, "Create Item");
  const resource = named(after, "Item");

  assert.equal(before.subsystems.some((item) => item.lens === "application"), false,
    "a REST resource path plus persistence helper must not invent an application operation");
  assert.ok(diff.elements.added.some((item) => item.id === operation.id));
  assert.ok(diff.claims.added.some((item) => item.sourceId === operation.id &&
    item.relation === "creates" && item.target.kind === "reference" && item.target.id === resource.id));
});

test("REST resource vocabulary can disambiguate typed members but cannot invent one", () => {
  const declarations = [
    { id: "catalog", file: "domain.py", name: "CatalogDocument", fields: [
      { name: "items", type: "list[Item]", evidence: { file: "domain.py", line: 2 } },
      { name: "groups", type: "list[Group]", evidence: { file: "domain.py", line: 3 } },
      { name: "archived_items", type: "list[ArchivedItem]", evidence: { file: "domain.py", line: 4 } },
    ] },
    { id: "item", file: "domain.py", name: "Item", fields: [] },
    { id: "test-item", file: "tests/test_domain.py", name: "Item", fields: [] },
    { id: "group", file: "domain.py", name: "Group", fields: [] },
    { id: "archived-item", file: "domain.py", name: "ArchivedItem", fields: [] },
    { id: "result", file: "domain.py", name: "MutationResult", fields: [
      { name: "item_ids", type: "list[str]", evidence: { file: "domain.py", line: 6 } },
    ] },
  ];
  const registry = { named: (name) => declarations.filter((item) => item.name === name) };
  const base = {
    name: "create_entry_in_catalog",
    subject: "CatalogDocument",
    relation: "creates",
    returnTypes: ["MutationResult"],
  };

  assert.equal(bindApplicationOperation({ ...base, interfaceTerms: ["items"] }, registry)?.resource, "Item");
  assert.equal(bindApplicationOperation({ ...base, returnTypes: [], interfaceTerms: ["items"] }, registry), null);
});

test("application operation lift is identical across parser and worker modes", { timeout: 30_000 }, async () => {
  const native = await scan("after", { parser: "native", jobs: 1 });
  const wasm = await scan("after", { parser: "wasm", jobs: 1 });
  const worker = await scan("after", { parser: "native", jobs: 2 });

  assert.deepEqual(wasm, native);
  assert.deepEqual(worker, native);
});
