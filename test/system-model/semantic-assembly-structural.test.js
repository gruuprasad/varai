import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { behavioralEnvelopes, behaviorFrames, systemPaths } from "../../src/system-model/projections/index.js";

const fixture = path.resolve("test/fixtures/semantic-assembly-structural");

test("assembles structural-type UI, API, contract, and aggregate evidence", async () => {
  const model = (await scanRepo(fixture, { jobs: 1, cache: false })).model;
  const byId = new Map(model.elements.map((item) => [item.id, item]));
  const targetName = (claim) => claim.target.kind === "reference" ? byId.get(claim.target.id)?.name : claim.target.value;

  const action = model.elements.find((item) => item.name === "StructuralBasisTypesPanel Apply change");
  const operation = model.elements.find((item) =>
    item.name === "PUT /api/v1/building-model/{job_id}/structural-types/{type_id}");
  assert.ok(action);
  assert.ok(operation);
  assert.ok(model.elements.some((item) => item.name === "StructuralTypeMutationResponse"),
    "inherited response contract is promoted");

  const actionClaims = model.claims.filter((item) => item.sourceId === action.id);
  assert.ok(actionClaims.some((item) => item.relation === "available_when" && item.target.value === "preview"));
  assert.ok(actionClaims.some((item) => item.relation === "invokes" && item.target.id === operation.id));

  const operationClaims = model.claims.filter((item) => item.sourceId === operation.id);
  assert.ok(operationClaims.some((item) => item.relation === "produces" &&
    targetName(item) === "StructuralTypeMutationResponse"));

  // The mutation subject is reached only through an unannotated wrapper (ensure_document),
  // a callable value (update_structural_type), and a nested closure — never a typed argument.
  const changeClaim = operationClaims.find((item) => item.relation === "changes" &&
    targetName(item) === "BuildingModelDocument");
  assert.ok(changeClaim, "API operation changes BuildingModelDocument through value flow");
  assert.ok(!operationClaims.some((item) => item.relation === "changes" &&
    ["JobContext", "file", "unknown"].includes(targetName(item))),
    "JobContext, file, and unknown are not the mutation subject");

  // Evidence chain records the wrappers, the callback, and the domain operation.
  const implSymbols = JSON.stringify(changeClaim.implementationPath ?? []);
  assert.ok(/update_structural_type/.test(implSymbols),
    "implementation path reaches the domain operation");

  const frames = behaviorFrames(model);
  const operationFrame = frames.frames.find((item) => item.behaviorId === operation.id);
  assert.ok(operationFrame.subjectIds.some((id) => byId.get(id)?.name === "BuildingModelDocument"));
  assert.ok(!operationFrame.subjectIds.some((id) => byId.get(id)?.name === "StructuralTypeMutationResponse"));
  assert.ok(!operationFrame.subjectIds.some((id) => byId.get(id)?.name === "JobContext"),
    "execution context is not a primary subject");

  const pathProjection = systemPaths(model);
  const assembled = pathProjection.paths.find((item) => item.name === "Apply change");
  assert.ok(assembled);
  assert.deepEqual(assembled.steps.map((item) => item.behaviorId), [action.id, operation.id]);
  assert.ok(assembled.subjectIds.some((id) => byId.get(id)?.name === "BuildingModelDocument"));
  assert.equal(assembled.completeness, "closed",
    "path is semantically closed on the aggregate it changes");

  const envelope = behavioralEnvelopes(model).envelopes.find((item) => item.name === "Apply change");
  const envelopeClaims = (field) => envelope[field].map((id) => model.claims.find((claim) => claim.id === id));
  assert.ok(envelope);
  assert.ok(envelopeClaims("conditionClaimIds").some((claim) =>
    claim.target.value === "integrity changes acknowledged when preview has integrity changes"),
  "availability preserves the preview acknowledgement guard");
  assert.ok(envelopeClaims("inputClaimIds").some((claim) => targetName(claim) === "UpdateStructuralTypeRequest"));
  assert.ok(envelopeClaims("outputClaimIds").some((claim) => targetName(claim) === "StructuralTypeMutationResponse"));
  assert.ok(envelopeClaims("outcomeClaimIds").some((claim) =>
    claim.relation === "fails_with" && String(claim.target.value) === "409"));
  assert.deepEqual(envelope.primarySubjectIds.map((id) => byId.get(id)?.name), ["BuildingModelDocument"]);
  assert.ok(!envelope.primarySubjectIds.some((id) =>
    ["contract", "state"].includes(byId.get(id)?.kind) || ["JobContext", "file", "unknown"].includes(byId.get(id)?.name)));
  assert.equal(envelope.completeness, "closed");
});

test("one action with multiple API reaches remains one behavioral envelope", async () => {
  const model = (await scanRepo(fixture, { jobs: 1, cache: false })).model;
  const action = model.elements.find((item) => item.name === "StructuralBasisTypesPanel Apply change");
  const preview = model.elements.find((item) =>
    item.name === "POST /api/v1/building-model/{job_id}/structural-types/{type_id}/preview");
  const existing = model.claims.find((item) => item.sourceId === action.id && item.relation === "invokes");
  const withPreparatoryCall = {
    ...model,
    claims: [...model.claims, {
      ...existing,
      id: "claim:test-preparatory-preview",
      slot: "invoke:POST /api/v1/building-model/{job_id}/structural-types/{type_id}/preview",
      target: { kind: "reference", id: preview.id },
    }],
  };

  const matches = behavioralEnvelopes(withPreparatoryCall).envelopes.filter((item) => item.entryBehaviorId === action.id);
  assert.equal(matches.length, 1, "a multi-call action is not split into competing complete stories");
  assert.equal(matches[0].terminalBehaviorId, null);
  assert.deepEqual(matches[0].terminalBehaviorIds.sort(), [preview.id,
    model.elements.find((item) => item.name === "PUT /api/v1/building-model/{job_id}/structural-types/{type_id}").id].sort());
  assert.ok(matches[0].behaviorIds.includes(preview.id));
  assert.equal(matches[0].invocationClaimIds.length, 2);
});
