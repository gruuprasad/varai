import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { behavioralEnvelopes } from "../../src/system-model/projections/index.js";

const fixture = path.resolve("test/fixtures/prisma-dataroom-create");

async function scan(options = {}) {
  return (await scanRepo(fixture, {
    cache: false,
    jobs: 1,
    systemName: "prisma-dataroom",
    ...options,
  })).model;
}

function named(model, name) {
  return model.elements.find((item) => item.name === name);
}

function relation(model, source, relationName, target) {
  return model.claims.find((item) => item.sourceId === source.id && item.relation === relationName &&
    (!target || (item.target.kind === "reference" && item.target.id === target.id)));
}

test("UI dataroom create closes on Prisma Dataroom resource", async () => {
  const model = await scan();
  const dataroom = model.elements.find((e) => e.name === "Dataroom" && e.roles.includes("resource"));
  const op = named(model, "POST /api/datarooms");
  const ui = model.elements.find((e) => e.name.includes("AddDataroomModal"));
  assert.ok(dataroom, "Dataroom resource");
  assert.ok(op, "POST /api/datarooms");
  assert.ok(ui, "AddDataroomModal action");
  assert.ok(relation(model, op, "creates", dataroom));
  assert.ok(relation(model, ui, "invokes", op));
  const envelope = behavioralEnvelopes(model).envelopes
    .find((e) => e.entryBehaviorId === ui.id);
  assert.ok(envelope);
  assert.ok(envelope.primarySubjectIds.includes(dataroom.id));
  assert.ok(["partial", "closed"].includes(envelope.completeness), envelope.completeness);
});

test("document update binds changes Document", async () => {
  const model = await scan();
  const document = model.elements.find((e) => e.name === "Document" && e.roles.includes("resource"));
  const op = named(model, "POST /api/teams/*/documents/update");
  const ui = model.elements.find((e) => e.name.includes("UpdateDocumentButton"));
  assert.ok(document && op && ui);
  assert.ok(relation(model, op, "changes", document));
  assert.ok(relation(model, ui, "invokes", op));
  const envelope = behavioralEnvelopes(model).envelopes
    .find((e) => e.entryBehaviorId === ui.id);
  assert.ok(envelope);
  assert.ok(envelope.primarySubjectIds.includes(document.id));
  assert.ok(["partial", "closed"].includes(envelope.completeness), envelope.completeness);
});

test("path segment alone does not invent Document create without prisma call", async () => {
  const model = await scan();
  const document = model.elements.find((e) => e.name === "Document" && e.roles.includes("resource"));
  const op = named(model, "POST /api/documents");
  assert.ok(op, "empty documents route still an operation");
  assert.ok(document, "Document exists from schema inventory");
  assert.equal(relation(model, op, "creates", document), undefined);
  assert.equal(relation(model, op, "changes", document), undefined);
  const ui = model.elements.find((e) => e.name.includes("CreateDocumentButton"));
  if (ui) {
    const envelope = behavioralEnvelopes(model).envelopes.find((e) => e.entryBehaviorId === ui.id);
    if (envelope) {
      assert.equal(envelope.primarySubjectIds.includes(document.id), false);
      assert.equal(envelope.completeness, "open");
    }
  }
});
