import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runBuildBegin, runBuildClose } from "../../src/build-session/commands.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { ratifySeed } from "../../src/seed/store.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

async function repo() {
  const root = await mkdtemp(path.join(tmpdir(), "varai-build-session-"));
  await writeFile(path.join(root, "app.py"), "def app():\n    return 1\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
  const seed = slotkeeperDraft();
  ratifySeed(root, seed, { ratifiedAt: "2026-07-28T00:00:00.000Z" });
  return root;
}

async function realization(root, seedHash) {
  await writeFile(path.join(root, "varai.realization.json"), JSON.stringify({ formatVersion: 1, seedHash, bindings: [], witnesses: [] }));
}

test("a carry-forward build records matching source snapshots and provenance", async () => {
  const root = await repo();
  try {
    const started = await runBuildBegin({ repo: root, json: true, cache: false });
    await realization(root, started.session.seedHash);
    const closed = await runBuildClose({ repo: root, mode: "carry-forward", cache: false });
    assert.equal(closed.session.completion.mode, "carry-forward");
    assert.equal(closed.report.provenance.state, "recorded_carry_forward");
    assert.equal(closed.session.start.implementationTreeHash, closed.session.completion.implementationTreeHash);
    assert.ok(closed.session.gate);
    assert.equal(closed.session.gate.state, GATE_STATES.READY);
    assert.deepEqual(closed.session.gate.coverageRegressions, []);
    assert.deepEqual(closed.session.gate.requirementRegressions, []);
    assert.equal(closed.exitCode ?? 0, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("carry-forward rejects an implementation-tree change", async () => {
  const root = await repo();
  try {
    const started = await runBuildBegin({ repo: root, json: true, cache: false });
    await realization(root, started.session.seedHash);
    await writeFile(path.join(root, "app.py"), "def app():\n    return 2\n");
    await assert.rejects(runBuildClose({ repo: root, mode: "carry-forward", cache: false }), /unchanged scanned implementation tree/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
