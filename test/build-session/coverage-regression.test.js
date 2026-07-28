import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runBuildBegin, runBuildClose } from "../../src/build-session/commands.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { classifyCoverageTransition } from "../../src/build-session/evaluate.js";
import { ratifySeed } from "../../src/seed/store.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { createSnapshotStore } from "../../src/snapshots/store.js";
import { scanRepo } from "../../src/scanners/index.js";

const FIXTURE = path.resolve("test/fixtures/fastapi-coverage-realistic");
const BOOK = "POST /api/bookings";

const seed = {
  formatVersion: 2,
  system: { id: "realistic", name: "Realistic" },
  context: [],
  concepts: [
    { id: "behavior.book-slot", role: "behavior", name: "Book slot" },
    { id: "resource.booking", role: "resource", name: "Booking" },
  ],
  commitments: [{
    id: "commitment.book-creates-booking",
    source: "behavior.book-slot",
    relation: "creates",
    target: { concept: "resource.booking" },
    expectation: "present",
  }],
};

function realization(seedHash) {
  return {
    formatVersion: 1,
    seedHash,
    witnesses: [],
    bindings: [
      { id: "binding.book", concept: "behavior.book-slot", artifact: { lens: "api", kind: "operation", key: BOOK } },
      { id: "binding.booking", concept: "resource.booking", artifact: { lens: "data", kind: "entity", key: "Booking" } },
    ],
  };
}

const withUnresolvedHelper = (source) => source
  .replace("    db.commit()\n    return BookingResponse", "    mystery_side_effect(slot)\n    db.commit()\n    return BookingResponse");

async function gitRepo(edit = (source) => source) {
  const root = await mkdtemp(path.join(tmpdir(), "varai-coverage-regression-"));
  await cp(FIXTURE, root, { recursive: true });
  const mainPath = path.join(root, "app", "main.py");
  await writeFile(mainPath, edit(await readFile(mainPath, "utf8")));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
  const ratified = ratifySeed(root, seed, { ratifiedAt: "2026-07-28T00:00:00.000Z" });
  await writeFile(path.join(root, "varai.realization.json"), JSON.stringify(realization(ratified.contentHash)));
  return root;
}

async function effectCoverage(repoPath) {
  const { model } = await scanRepo(repoPath, { jobs: 1, cache: false });
  const operation = model.elements.find((element) => element.kind === "operation" && element.name === BOOK);
  return model.coverage.find((record) =>
    record.capability === "api.effect" && record.scopeId === operation?.id);
}

async function loadModel(repoPath, snapshotId) {
  const store = createSnapshotStore(repoPath);
  const manifest = await store.getSnapshot(snapshotId);
  return store.getObject(manifest.modelObjectHash);
}

test("adding an unresolved helper after baseline degrades coverage and needs attention", async () => {
  const root = await gitRepo();
  try {
    const started = await runBuildBegin({ repo: root, json: true, cache: false, jobs: 1 });
    const startEffect = await effectCoverage(root);
    assert.equal(startEffect.state, "analyzed");

    const mainPath = path.join(root, "app", "main.py");
    await writeFile(mainPath, withUnresolvedHelper(await readFile(mainPath, "utf8")));

    const closed = await runBuildClose({ repo: root, mode: "built", cache: false, jobs: 1 });
    assert.equal(closed.session.gate.state, GATE_STATES.NEEDS_ATTENTION);
    assert.ok(closed.session.gate.coverageRegressions.some((item) => item.transition === "degraded"));
    assert.equal(closed.exitCode, 1);

    const endModel = await loadModel(root, closed.session.completion.snapshotId);
    const startModel = await loadModel(root, started.session.start.snapshotId);
    const startRecord = startModel.coverage.find((record) =>
      record.capability === "api.effect" && record.scopeId === startEffect.scopeId);
    const endRecord = endModel.coverage.find((record) =>
      record.capability === "api.effect" && record.scopeId === startEffect.scopeId);
    assert.equal(classifyCoverageTransition(startRecord, endRecord), "degraded");
    assert.equal(endRecord.state, "partial");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("removing an unresolved helper improves coverage", async () => {
  const root = await gitRepo(withUnresolvedHelper);
  try {
    const started = await runBuildBegin({ repo: root, json: true, cache: false, jobs: 1 });
    const startEffect = await effectCoverage(root);
    assert.equal(startEffect.state, "partial");

    const mainPath = path.join(root, "app", "main.py");
    const clean = (await readFile(path.join(FIXTURE, "app", "main.py"), "utf8"));
    await writeFile(mainPath, clean);

    const closed = await runBuildClose({ repo: root, mode: "built", cache: false, jobs: 1 });
    assert.equal(closed.session.gate.state, GATE_STATES.READY);
    assert.equal(closed.exitCode ?? 0, 0);

    const endModel = await loadModel(root, closed.session.completion.snapshotId);
    const startModel = await loadModel(root, started.session.start.snapshotId);
    const scopeId = startEffect.scopeId;
    const startRecord = startModel.coverage.find((record) => record.capability === "api.effect" && record.scopeId === scopeId);
    const endRecord = endModel.coverage.find((record) => record.capability === "api.effect" && record.scopeId === scopeId);
    assert.equal(classifyCoverageTransition(startRecord, endRecord), "improved");
    assert.equal(endRecord.state, "analyzed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("seed content hash for realization stays stable across edits", () => {
  assert.equal(seedContentHash(seed), seedContentHash(seed));
});
