import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { diffSystemModels } from "../../src/system-model/diff.js";
import { behavioralEnvelopes } from "../../src/system-model/projections/index.js";

const fixture = (name) => path.resolve(`test/fixtures/resource-lifecycle/${name}`);

async function scan(name, options = {}) {
  return (await scanRepo(fixture(name), { cache: false, jobs: 1, systemName: "resource-lifecycle-fixture", ...options })).model;
}

function named(model, name) { return model.elements.find((item) => item.name === name); }
function relation(model, source, relationName, target) {
  return model.claims.find((item) => item.sourceId === source.id && item.relation === relationName &&
    (!target || (item.target.kind === "reference" && item.target.id === target.id)));
}

test("persistence and navigation evidence recover resource lifecycle semantics", async () => {
  const model = await scan("after");
  const create = named(model, "POST /workspaces");
  const revoke = named(model, "POST /access/revoke");
  const workspace = named(model, "Workspace");
  const grant = named(model, "AccessGrant");
  const owner = named(model, "Owner");
  const form = named(model, "CreateWorkspaceForm handle Submit");

  assert.ok(create && revoke && workspace && grant && owner && form);
  assert.ok(relation(model, create, "creates", workspace));
  assert.equal(["changes", "creates", "removes"].some((name) => relation(model, create, name, owner)), false,
    "a create-resource wrapper must not attribute its verb to a supporting typed argument");
  assert.ok(relation(model, revoke, "changes", grant));
  assert.ok(relation(model, revoke, "removes", grant));
  const navigation = relation(model, form, "navigates_to");
  assert.equal(navigation.target.value, "/workspaces/{value}/edit");
  assert.ok(navigation.evidence.some((item) => item.file.endsWith("CreateWorkspaceForm.tsx")));
  assert.ok(model.coverage.some((item) => item.capability === "ui.navigation" && item.state === "partial"));

  const envelope = behavioralEnvelopes(model).envelopes.find((item) => item.entryBehaviorId === form.id);
  assert.ok(envelope);
  assert.ok(envelope.primarySubjectIds.includes(workspace.id));
  assert.ok(envelope.outcomeClaimIds.includes(navigation.id));
});

test("resource lifecycle changes produce meaningful semantic progression", async () => {
  const diff = diffSystemModels(await scan("before"), await scan("after"));
  assert.ok(diff.claims.added.some((item) => item.relation === "creates"));
  assert.ok(diff.claims.added.some((item) => item.relation === "removes"));
  assert.ok(diff.claims.added.some((item) => item.relation === "navigates_to"));
});

test("resource lifecycle lift is identical across parser and worker modes", { timeout: 30_000 }, async () => {
  const native = await scan("after", { parser: "native", jobs: 1 });
  const wasm = await scan("after", { parser: "wasm", jobs: 1 });
  const worker = await scan("after", { parser: "native", jobs: 2 });
  assert.deepEqual(wasm, native);
  assert.deepEqual(worker, native);
});
