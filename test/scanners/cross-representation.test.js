import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";

test("boundary annotations bind API claims to declaration-backed contracts", async () => {
  const scan = await scanRepo(path.resolve("test/fixtures/anchor-lift/base"), {
    jobs: 1,
    cache: false,
    systemName: "anchor-lift-fixture",
  });
  const contracts = new Map(scan.model.elements
    .filter((item) => item.kind === "contract")
    .map((item) => [item.id, item]));
  const boundaryClaims = scan.model.claims.filter((item) => ["accepts", "produces"].includes(item.relation));

  assert.ok(boundaryClaims.length >= 4);
  assert.ok(boundaryClaims.every((item) => item.target.kind === "reference" && contracts.has(item.target.id)));
  assert.ok(boundaryClaims.every((item) => item.implementationPath.length >= 1));

  const uiInvocation = scan.model.claims.find((item) => item.relation === "invokes" && item.sourceId !== item.target.id);
  assert.ok(uiInvocation, "literal frontend request is linked to the matching API operation");
  assert.equal(uiInvocation.target.kind, "reference");
  assert.equal(scan.model.elements.find((item) => item.id === uiInvocation.target.id)?.name,
    "DELETE /projects/{project_id}/building/storeys/{storey_id}");
});
