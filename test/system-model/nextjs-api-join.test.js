import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { detectStacks } from "../../src/scanners/stack-detect.js";
import {
  behavioralEnvelopes,
  systemPaths,
} from "../../src/system-model/projections/index.js";

const fixture = path.resolve("test/fixtures/nextjs-api-join");

test("detects nextjs and react-vite stacks from package.json", async () => {
  const stacks = await detectStacks(fixture);
  assert.ok(stacks.has("nextjs"));
  assert.ok(stacks.has("react-vite"));
});

test("Next.js API routes bind UI invokes into system paths and envelopes", async () => {
  const model = (await scanRepo(fixture, {
    cache: false,
    jobs: 1,
    systemName: "nextjs-api-join-fixture",
  })).model;

  const create = model.elements.find((item) => item.name === "POST /api/workspaces");
  const form = model.elements.find((item) => item.name === "CreateWorkspaceForm handle Submit");
  assert.ok(create, "App Router POST /api/workspaces operation");
  assert.ok(form, "UI form action");

  const invoke = model.claims.find((claim) =>
    claim.sourceId === form.id &&
    claim.relation === "invokes" &&
    claim.target.kind === "reference" &&
    claim.target.id === create.id);
  assert.ok(invoke, "UI invoke must reference the Next.js operation");

  const pagesPost = model.elements.find((item) => item.name === "POST /api/teams/*/documents");
  assert.ok(pagesPost, "Pages API dynamic route operation");

  const upload = model.elements.find((item) => item.name === "UploadDocumentButton handle Click");
  assert.ok(upload, "concrete dynamic-path UI action");
  const dynamicInvoke = model.claims.find((claim) =>
    claim.sourceId === upload.id &&
    claim.relation === "invokes" &&
    claim.target.kind === "reference" &&
    claim.target.id === pagesPost.id);
  assert.ok(dynamicInvoke, "concrete /api/teams/42/documents must bind to POST /api/teams/*/documents");

  const paths = systemPaths(model).paths.filter((item) => item.entryBehaviorId === form.id);
  assert.ok(paths.length >= 1, "system path from form to API");

  const envelope = behavioralEnvelopes(model).envelopes.find((item) => item.entryBehaviorId === form.id);
  assert.ok(envelope, "behavioral envelope for form submit");
  assert.ok(envelope.invocationClaimIds.includes(invoke.id));

  const uploadEnvelope = behavioralEnvelopes(model).envelopes.find((item) => item.entryBehaviorId === upload.id);
  assert.ok(uploadEnvelope, "envelope for concrete dynamic-path upload");
});
