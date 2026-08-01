import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { reconcile } from "../../src/reconciliation/check.js";
import { readRealization } from "../../src/reconciliation/witness-store.js";
import { readSeed } from "../../src/seed/store.js";
import { evaluateBuildGate } from "../../src/build-session/evaluate.js";

const fixture = path.resolve("test/fixtures/authorization-state-app");
const modelPromise = scanRepo(fixture, { jobs: 1, cache: false }).then((scan) => scan.model);
const { seed } = readSeed(fixture);
const { realization } = readRealization(fixture, { seed });

async function mutatedModel(replacements) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "varai-v4-"));
  fs.cpSync(fixture, dir, { recursive: true });
  try {
    let content = fs.readFileSync(path.join(dir, "app.py"), "utf8");
    for (const [from, to] of replacements) {
      assert.ok(content.includes(from), `fixture must contain ${JSON.stringify(from)}`);
      content = content.replace(from, to);
    }
    fs.writeFileSync(path.join(dir, "app.py"), content);
    return (await scanRepo(dir, { jobs: 1, cache: false })).model;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("declared transitions hold only with from-state/path evidence", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  const section = report.stateModels.find((item) => item.resourceId === "resource.purchase-request");
  assert.ok(section, "the state model is checked");
  const byTarget = Object.fromEntries(section.transitions.map((t) => [t.to, t]));
  assert.equal(byTarget.withdrawn.verdict, "holds", "guarded transition holds");
  assert.equal(byTarget.approved.verdict, "holds", "guarded transition holds");
  assert.equal(byTarget.cancelled.verdict, "cannot_verify", "unguarded transition never holds statically");
  assert.deepEqual(byTarget.cancelled.reasons, ["insufficient-coverage"]);
});

test("declared fields hold against observed has_field claims with type qualifiers", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  const section = report.fieldContracts.find((item) => item.resourceId === "resource.submission-details");
  assert.ok(section, "the field contract is checked");
  assert.equal(section.fields.length, 2);
  assert.ok(section.fields.every((field) => field.verdict === "holds"));
  const amount = section.fields.find((field) => field.name === "amount");
  assert.deepEqual(amount.declared, { type: "number", required: true });
});

test("flows project member readiness without new verdicts", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  const flow = report.flows.find((item) => item.id === "flow.request-lifecycle");
  assert.ok(flow, "the flow is projected");
  assert.equal(flow.entry, "surface.submit-api");
  const submit = flow.memberReadiness.find((item) => item.member === "behavior.submit-request");
  assert.ok(submit.commitments >= 2);
  assert.ok(submit.holds >= 2);
});

test("a wrong state target violates the declared transition statically", async () => {
  const model = await mutatedModel([
    ['    request.state = "withdrawn"', '    request.state = "cancelled"'],
  ]);
  const report = reconcile({ model, seed, realization });
  const section = report.stateModels.find((item) => item.resourceId === "resource.purchase-request");
  const withdraw = section.transitions.find((t) => t.to === "withdrawn");
  assert.equal(withdraw.verdict, "violated");
  assert.deepEqual(withdraw.reasons, ["transition-absent-under-analyzed-coverage"]);
});

test("a missing declared field is violated under analyzed data.contract coverage", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "varai-v4-fields-"));
  fs.cpSync(fixture, dir, { recursive: true });
  try {
    const schemas = path.join(dir, "schemas.py");
    let content = fs.readFileSync(schemas, "utf8");
    content = content.replace('    description: str\n', "");
    assert.notEqual(content, fs.readFileSync(schemas, "utf8"), "fixture must contain the description field");
    fs.writeFileSync(schemas, content);
    const model = (await scanRepo(dir, { jobs: 1, cache: false })).model;
    const report = reconcile({ model, seed, realization });
    const section = report.fieldContracts.find((item) => item.resourceId === "resource.submission-details");
    const description = section.fields.find((field) => field.name === "description");
    assert.equal(description.verdict, "violated");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readiness gate v2 blocks on violated transitions and field contracts", async () => {
  const model = await mutatedModel([
    ['    request.state = "withdrawn"', '    request.state = "cancelled"'],
  ]);
  const report = reconcile({ model, seed, realization });
  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: report,
    completionReport: report,
  });
  assert.equal(gate.state, "needs_attention");
  assert.ok(gate.stateModelProblems.some((item) => item.from === "pending" && item.to === "withdrawn"));
  assert.ok(gate.reasons.some((reason) => reason.startsWith("state-transition-violated:")));
});

test("a clean v4 report keeps the gate ready", async () => {
  const model = await modelPromise;
  const report = reconcile({ model, seed, realization });
  const gate = evaluateBuildGate({
    startModel: model,
    completionModel: model,
    startReport: report,
    completionReport: report,
  });
  assert.equal(gate.state, "ready");
  assert.equal(gate.stateModelProblems.length, 0);
  assert.equal(gate.fieldContractProblems.length, 0);
});
