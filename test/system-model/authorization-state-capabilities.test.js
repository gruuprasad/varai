import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { readSeed } from "../../src/seed/store.js";

const fixture = path.resolve("test/fixtures/authorization-state-app");
const modelPromise = scanRepo(fixture, { jobs: 1, cache: false }).then((scan) => scan.model);
const { seed } = readSeed(fixture);
const { realization } = readRealization(fixture, { seed });

const byCommitment = (report, id) => report.commitments.find((item) => item.id === id);
const operationByKey = (model, key) => model.elements.find((element) => element.key === key);

async function mutatedModel(replacements) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "varai-auth-state-"));
  fs.cpSync(fixture, dir, { recursive: true });
  try {
    let content = fs.readFileSync(path.join(dir, "app.py"), "utf8");
    for (const [from, to] of replacements) {
      assert.ok(content.includes(from), `fixture must contain ${JSON.stringify(from)}`);
      content = content.replace(from, to);
    }
    fs.writeFileSync(path.join(dir, "app.py"), content);
    const scan = await scanRepo(dir, { jobs: 1, cache: false });
    return scan.model;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("the green baseline emits authorization, state, emits, and field-contract evidence", async () => {
  const model = await modelPromise;
  const authClaims = model.claims.filter((claim) => claim.capability === "api.authorization");
  assert.equal(authClaims.length, 5, "every guarded operation carries an authorization condition");
  assert.ok(authClaims.every((claim) => claim.relation === "requires"));

  const withdraw = operationByKey(model, "POST /api/purchase-requests/{request_id}/withdraw");
  assert.ok(authClaims.some((claim) => claim.sourceId === withdraw.id && claim.target.value === "authenticated"));
  const approve = operationByKey(model, "POST /api/purchase-requests/{request_id}/approve");
  assert.ok(authClaims.some((claim) => claim.sourceId === approve.id && claim.target.value === "manager"),
    "role literal from require_role(\"manager\") becomes the exact condition");

  const stateClaims = model.claims.filter((claim) => claim.capability === "application.state");
  const withdrawState = stateClaims.find((claim) => claim.sourceId === withdraw.id);
  assert.equal(withdrawState.target.value, "withdrawn");
  assert.equal(withdrawState.qualifiers.state_from, "pending", "from-state/path evidence is captured");
  const cancel = operationByKey(model, "POST /api/purchase-requests/{request_id}/cancel");
  const cancelState = stateClaims.find((claim) => claim.sourceId === cancel.id);
  assert.equal(cancelState.qualifiers.state_from, undefined, "unguarded transition carries no from-state");

  const emitsClaims = model.claims.filter((claim) => claim.relation === "emits");
  assert.ok(emitsClaims.some((claim) => claim.sourceId === approve.id && claim.target.value === "external-http:post"));
  assert.ok(emitsClaims.some((claim) => claim.capability === "api.effect"));

  const fieldClaims = model.claims.filter((claim) => claim.relation === "has_field" && claim.capability === "data.contract");
  const amount = fieldClaims.find((claim) => claim.target.value === "amount");
  assert.deepEqual(amount.qualifiers, { type: "integer", required: true });
  const reference = fieldClaims.find((claim) => claim.target.value === "reference");
  assert.equal(reference.qualifiers.required, false, "defaulted field is not claimed required");
});

test("coverage discipline: guarded transitions analyzed, unguarded and unresolved partial", async () => {
  const model = await modelPromise;
  const coverageFor = (capability, element) => model.coverage.find((record) =>
    record.capability === capability && record.scopeId === element.id);
  const withdraw = operationByKey(model, "POST /api/purchase-requests/{request_id}/withdraw");
  const cancel = operationByKey(model, "POST /api/purchase-requests/{request_id}/cancel");
  assert.equal(coverageFor("application.state", withdraw).state, "analyzed");
  assert.equal(coverageFor("application.state", cancel).state, "partial", "unguarded transition never analyzed");
  assert.equal(coverageFor("api.authorization", withdraw).state, "analyzed");
});


test("every ratified commitment holds against the green baseline", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  assert.equal(report.summary.total, 8);
  assert.equal(report.summary.holds, 8, JSON.stringify(report.commitments.map((item) => [item.id, item.verdict]), null, 1));
  for (const item of report.commitments) {
    assert.equal(item.verdict, "holds", item.id);
    assert.ok(item.claimIds.length > 0, `${item.id} cites canonical claims`);
  }
});

test("inverted authorization is caught statically — not only by scenarios", async () => {
  const model = await mutatedModel([
    ["def withdraw_request(request_id: int, credentials: dict = Depends(current_user)):",
      "def withdraw_request(request_id: int):"],
  ]);
  const withdraw = operationByKey(model, "POST /api/purchase-requests/{request_id}/withdraw");
  const authClaims = model.claims.filter((claim) => claim.sourceId === withdraw.id && claim.capability === "api.authorization");
  assert.equal(authClaims.length, 0, "the faulted operation has no authorization claim");
  const coverage = model.coverage.find((record) =>
    record.capability === "api.authorization" && record.scopeId === withdraw.id);
  assert.equal(coverage.state, "analyzed", "guard vocabulary elsewhere keeps the scope analyzed");
  const report = reconcile({ model, seed, realization });
  const item = byCommitment(report, "commitment.withdraw-requires-auth");
  assert.equal(item.verdict, "violated", "absence under analyzed authorization coverage is a violation");
});

test("a wrong state target is violated; an unguarded transition stays honest", async () => {
  const wrongTarget = await mutatedModel([
    ['    request.state = "withdrawn"', '    request.state = "cancelled"'],
  ]);
  const reportWrong = reconcile({ model: wrongTarget, seed, realization });
  assert.equal(byCommitment(reportWrong, "commitment.withdraw-changes-state").verdict, "violated");

  // The target assignment still exists without the guard, so the claim holds —
  // but the element's application.state coverage degrades to partial, which is
  // exactly what a declared from-state (seed v4 state model) cannot verify.
  const unguardedModel = await mutatedModel([
    ["    if request.state != \"pending\":\n        raise HTTPException(status_code=409, detail=\"request is not pending\")\n    request.state = \"withdrawn\"",
      "    request.state = \"withdrawn\""],
  ]);
  const reportUnguarded = reconcile({ model: unguardedModel, seed, realization });
  const item = byCommitment(reportUnguarded, "commitment.withdraw-changes-state");
  assert.equal(item.verdict, "holds", "the assignment is still observed");
  const withdraw = operationByKey(unguardedModel, "POST /api/purchase-requests/{request_id}/withdraw");
  const stateCoverage = unguardedModel.coverage.find((record) =>
    record.capability === "application.state" && record.scopeId === withdraw.id);
  assert.equal(stateCoverage.state, "partial", "missing path evidence degrades application.state coverage, never a false green");
});

test("a missing emission is violated under analyzed effect coverage", async () => {
  const model = await mutatedModel([
    ['    record_event("request.submitted", purchase.request_id)\n', ""],
  ]);
  const report = reconcile({ model, seed, realization });
  const item = byCommitment(report, "commitment.submit-emits-outbox");
  assert.equal(item.verdict, "violated");
});

test("coverage poisoning degrades the verdict to cannot_verify, never a false green", async () => {
  // Present claim + poisoned coverage: the claim still holds, and nothing
  // invents a violation.
  const poisoned = await mutatedModel([
    ['    record_event("request.submitted", purchase.request_id)',
      '    record_event("request.submitted", purchase.request_id)\n    opaque_helper(purchase.request_id)'],
  ]);
  const submit = operationByKey(poisoned, "POST /api/purchase-requests");
  const effectCoverage = poisoned.coverage.find((record) =>
    record.capability === "api.effect" && record.scopeId === submit.id);
  assert.equal(effectCoverage.state, "partial", "unresolved calls degrade the element scope");
  const reportPoisoned = reconcile({ model: poisoned, seed, realization });
  const present = byCommitment(reportPoisoned, "commitment.submit-emits-outbox");
  assert.equal(present.verdict, "holds", "observed claims survive coverage poisoning");
  assert.equal(reportPoisoned.summary.violated, 0, "poisoned coverage never produces a false violation");

  // Missing claim + poisoned coverage: honest cannot_verify, never violated.
  const poisonedMissing = await mutatedModel([
    ['    record_event("request.submitted", purchase.request_id)\n', '    opaque_helper(purchase.request_id)\n'],
  ]);
  const reportMissing = reconcile({ model: poisonedMissing, seed, realization });
  const missing = byCommitment(reportMissing, "commitment.submit-emits-outbox");
  assert.equal(missing.verdict, "cannot_verify", "a missing emission under degraded coverage cannot be a verdict");
  assert.deepEqual(missing.reasons, ["insufficient-coverage"]);
});
