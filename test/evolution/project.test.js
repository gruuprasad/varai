import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBuildSessionStore } from "../../src/build-session/store.js";
import { projectProgression } from "../../src/evolution/project.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

async function storePair(repo, { beforeResult, afterResult, beforeSeed, afterSeed }) {
  const store = createBuildSessionStore(repo);
  const beforeReportHash = await store.putObject({ commitments: [beforeResult] });
  const afterReportHash = await store.putObject({ commitments: [afterResult] });
  const beforeSeedObjectHash = await store.putObject(beforeSeed);
  const afterSeedObjectHash = await store.putObject(afterSeed);
  const ids = ["build:before", "build:after"];
  await store.putSession({ id: ids[0], seedObjectHash: beforeSeedObjectHash, completedAt: "2026-01-01T00:00:00.000Z", completion: { mode: "built", reportHash: beforeReportHash } });
  await store.putSession({ id: ids[1], seedObjectHash: afterSeedObjectHash, completedAt: "2026-01-02T00:00:00.000Z", completion: { mode: "carry-forward", reportHash: afterReportHash } });
  return { store, ids };
}

test("progression keeps seed, evidence, binding, and verdict transitions separate", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-progression-"));
  const beforeSeed = slotkeeperDraft();
  const afterSeed = { ...beforeSeed, context: [...beforeSeed.context, { id: "context.note", text: "A note" }] };
  const baseResult = { id: "commitment.booking-creates-booking", claimIds: ["claim.one"], bindings: [{ id: "binding.behavior", state: "resolved" }], coverage: [{ capability: "api.effect", scopeId: "el:book", state: "analyzed", analyzerVersion: "0.20.0" }], verdict: "holds" };
  const { ids } = await storePair(repo, { beforeResult: baseResult, afterResult: baseResult, beforeSeed, afterSeed });
  const result = await projectProgression(repo, { from: ids[0], to: ids[1] });
  const item = result.requirements.find((entry) => entry.id === baseResult.id);
  assert.equal(item.seed, "unchanged");
  assert.equal(item.implementation, "unchanged", "a recorded-note-only seed change is not implementation drift");
  assert.equal(item.binding, "unchanged");
  assert.equal(item.coverage, "unchanged");
  assert.deepEqual(item.verdict, { from: "holds", to: "holds" });
  assert.equal(item.verdictKind, "unchanged");
  assert.equal(result.seedDiff.context.added.length, 1);
});

test("progression distinguishes holds to cannot_verify as a requirement regression", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-progression-regress-"));
  const seed = slotkeeperDraft();
  const before = { id: "commitment.booking-creates-booking", claimIds: ["claim.one"], bindings: [{ id: "binding.behavior", state: "resolved" }], coverage: [{ capability: "api.effect", scopeId: "el:book", state: "analyzed", analyzerVersion: "0.20.0" }], verdict: "holds" };
  const after = { ...before, verdict: "cannot_verify", coverage: [{ capability: "api.effect", scopeId: "el:book", state: "partial", analyzerVersion: "0.20.0" }] };
  const { ids } = await storePair(repo, { beforeResult: before, afterResult: after, beforeSeed: seed, afterSeed: seed });
  const result = await projectProgression(repo, { from: ids[0], to: ids[1] });
  const item = result.requirements.find((entry) => entry.id === before.id);
  assert.equal(item.coverage, "degraded");
  assert.deepEqual(item.verdict, { from: "holds", to: "cannot_verify" });
  assert.equal(item.verdictKind, "holds_to_cannot_verify");
  assert.equal(item.requirementRegression, true);
});

test("progression distinguishes holds to violated as a requirement regression", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-progression-violated-"));
  const seed = slotkeeperDraft();
  const before = { id: "commitment.booking-creates-booking", claimIds: ["claim.one"], bindings: [{ id: "binding.behavior", state: "resolved" }], coverage: [{ capability: "api.effect", scopeId: "el:book", state: "analyzed", analyzerVersion: "0.20.0" }], verdict: "holds" };
  const after = { ...before, verdict: "violated", claimIds: [] };
  const { ids } = await storePair(repo, { beforeResult: before, afterResult: after, beforeSeed: seed, afterSeed: seed });
  const result = await projectProgression(repo, { from: ids[0], to: ids[1] });
  const item = result.requirements.find((entry) => entry.id === before.id);
  assert.equal(item.verdictKind, "holds_to_violated");
  assert.equal(item.requirementRegression, true);
});

test("analyzer-version-only coverage change is not an application regression", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-progression-analyzer-"));
  const seed = slotkeeperDraft();
  const before = { id: "commitment.booking-creates-booking", claimIds: ["claim.one"], bindings: [{ id: "binding.behavior", state: "resolved" }], coverage: [{ capability: "api.effect", scopeId: "el:book", state: "analyzed", analyzerVersion: "0.20.0" }], verdict: "holds" };
  const after = { ...before, coverage: [{ capability: "api.effect", scopeId: "el:book", state: "analyzed", analyzerVersion: "0.21.0" }] };
  const { ids } = await storePair(repo, { beforeResult: before, afterResult: after, beforeSeed: seed, afterSeed: seed });
  const result = await projectProgression(repo, { from: ids[0], to: ids[1] });
  const item = result.requirements.find((entry) => entry.id === before.id);
  assert.equal(item.coverage, "analyzer_version_changed");
  assert.equal(item.requirementRegression, false);
  assert.equal(item.verdictKind, "unchanged");
});

test("evidence-only movement stays distinct from coverage degradation", async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-progression-moved-"));
  const seed = slotkeeperDraft();
  const before = { id: "commitment.booking-creates-booking", claimIds: ["claim.one"], bindings: [{ id: "binding.behavior", state: "resolved" }], coverage: [{ capability: "api.effect", scopeId: "el:book", state: "analyzed", analyzerVersion: "0.20.0" }], verdict: "holds" };
  const after = { ...before, claimIds: ["claim.relocated"] };
  const { ids } = await storePair(repo, { beforeResult: before, afterResult: after, beforeSeed: seed, afterSeed: seed });
  const result = await projectProgression(repo, { from: ids[0], to: ids[1] });
  const item = result.requirements.find((entry) => entry.id === before.id);
  assert.equal(item.implementation, "moved");
  assert.equal(item.coverage, "unchanged");
  assert.equal(item.verdictKind, "unchanged");
});
