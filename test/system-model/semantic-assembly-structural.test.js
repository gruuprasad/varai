import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { behaviorFrames, systemPaths } from "../../src/system-model/projections/index.js";

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
});
