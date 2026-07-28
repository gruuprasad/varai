import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { clearAdapters, registerAdapter } from "../../src/builder/adapter.js";
import { createBuilderStore } from "../../src/builder/store.js";
import {
  recordBuildIntervention,
  resolveConfiguredAdapter,
  runBuildRun,
  runBuildStop,
} from "../../src/builder/commands.js";
import { runBuildStatus } from "../../src/build-session/commands.js";
import { createBuildSessionStore } from "../../src/build-session/store.js";
import { BUILD_STATES, GATE_STATES } from "../../src/build-session/state.js";
import { ratifySeed, readSeed } from "../../src/seed/store.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

const fixtureCli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/fake-builder/cli.js",
);

async function repoWithConfig(builderArgs) {
  const root = await mkdtemp(path.join(tmpdir(), "varai-builder-session-"));
  await writeFile(path.join(root, "app.py"), "def app():\n    return 1\n");
  await writeFile(path.join(root, "varai.config.json"), JSON.stringify({
    builders: {
      fake: {
        executable: process.execPath,
        args: [fixtureCli, ...builderArgs, "--packet"],
      },
    },
  }));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
  ratifySeed(root, slotkeeperDraft(), { ratifiedAt: "2026-07-28T00:00:00.000Z" });
  return root;
}

test("build run takes approved seed through fake builder and automatic verification", async () => {
  const root = await repoWithConfig(["--mode", "success"]);
  try {
    const result = await runBuildRun({ repo: root, adapter: "fake", json: true, cache: false });
    assert.ok(result.session.completedAt);
    assert.equal(result.session.lifecycleState, BUILD_STATES.READY);
    assert.equal(result.session.gate.state, GATE_STATES.READY);
    assert.equal(result.exitCode ?? 0, 0);
    const realization = JSON.parse(await readFile(path.join(root, "varai.realization.json"), "utf8"));
    assert.equal(realization.seedHash, result.session.seedHash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-zero builder exit records build_failed without a ready gate", async () => {
  const root = await repoWithConfig(["--mode", "fail"]);
  try {
    const result = await runBuildRun({ repo: root, adapter: "fake", json: true, cache: false });
    assert.equal(result.session.lifecycleState, BUILD_STATES.BUILD_FAILED);
    assert.equal(result.session.gate?.state, GATE_STATES.BUILD_FAILED);
    assert.notEqual(result.session.gate?.state, GATE_STATES.READY);
    assert.equal(result.exitCode, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("seed change while active marks the session superseded", async () => {
  const root = await repoWithConfig(["--mode", "hang"]);
  try {
    const runPromise = runBuildRun({ repo: root, adapter: "fake", json: true, cache: false });
    // Wait until session is active/building
    let active = null;
    for (let i = 0; i < 50; i++) {
      const store = createBuildSessionStore(root);
      active = await store.getActive();
      if (active) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(active, "expected an active build session");
    const next = slotkeeperDraft();
    next.system = { ...next.system, name: "Slotkeeper Changed" };
    ratifySeed(root, next, { ratifiedAt: "2026-07-28T01:00:00.000Z" });
    await runBuildStop({ repo: root, json: true });
    const result = await runPromise;
    assert.equal(result.session.lifecycleState, BUILD_STATES.SUPERSEDED);
    assert.equal(result.session.gate?.state, GATE_STATES.SUPERSEDED);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("builder stdout claiming ready cannot set the gate", async () => {
  const root = await repoWithConfig(["--mode", "gate-hack"]);
  try {
    const result = await runBuildRun({ repo: root, adapter: "fake", json: true, cache: false });
    const events = await createBuilderStore(root).listEvents(result.session.id);
    assert.ok(events.some((e) => String(e.text ?? "").includes('"gate"')), "builder claimed gate in stdout");
    // Gate comes only from evaluateBuildGate / failure path — not from stdout JSON.
    assert.ok(result.session.gate);
    assert.ok([GATE_STATES.READY, GATE_STATES.NEEDS_ATTENTION, GATE_STATES.BUILD_FAILED].includes(result.session.gate.state));
    assert.equal(result.session.gate.source, undefined);
    assert.ok(!result.session.gate.fromBuilder);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manual edits during an active session are recorded as interventions", async () => {
  const root = await repoWithConfig(["--mode", "hang"]);
  try {
    const runPromise = runBuildRun({ repo: root, adapter: "fake", json: true, cache: false });
    let sessionId = null;
    for (let i = 0; i < 50; i++) {
      const store = createBuildSessionStore(root);
      const active = await store.getActive();
      if (active) {
        sessionId = active.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(sessionId);
    await writeFile(path.join(root, "app.py"), "def app():\n    return 99\n");
    await recordBuildIntervention(root, { path: "app.py", reason: "manual_edit" });
    await runBuildStop({ repo: root, json: true });
    const result = await runPromise;
    assert.ok((result.session.interventions ?? []).some((item) => item.path === "app.py"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("crash recovery reports session status without inventing a running process", async () => {
  const root = await repoWithConfig(["--mode", "success"]);
  try {
    // Simulate an orphaned in-progress session left on disk (server restart).
    const { runBuildBegin } = await import("../../src/build-session/commands.js");
    const started = await runBuildBegin({ repo: root, json: true, cache: false });
    const store = createBuildSessionStore(root);
    const session = await store.getSession(started.session.id);
    session.lifecycleState = BUILD_STATES.BUILDING;
    session.builder = {
      adapterId: "fake",
      running: false,
      orphaned: true,
      note: "process not attached after restart",
    };
    await store.putSession(session);
    const status = await runBuildStatus({ repo: root, json: true });
    assert.equal(status.active.id, session.id);
    assert.equal(status.active.lifecycleState, BUILD_STATES.BUILDING);
    assert.equal(status.active.builder.running, false);
    assert.equal(status.active.builder.orphaned, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveConfiguredAdapter never accepts an arbitrary executable from callers", async () => {
  const root = await repoWithConfig(["--mode", "success"]);
  try {
    await assert.rejects(
      () => resolveConfiguredAdapter(root, "missing"),
      /not configured|unknown adapter/i,
    );
    const adapter = await resolveConfiguredAdapter(root, "fake");
    assert.equal(adapter.id, "fake");
    assert.equal(adapter.executable, process.execPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("registered fake adapter works through the same session API", async () => {
  clearAdapters();
  const root = await mkdtemp(path.join(tmpdir(), "varai-builder-reg-"));
  try {
    await writeFile(path.join(root, "app.py"), "def app():\n    return 1\n");
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
    execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
    ratifySeed(root, slotkeeperDraft(), { ratifiedAt: "2026-07-28T00:00:00.000Z" });

    registerAdapter({
      id: "inline-fake",
      async start({ cwd, onEvent }) {
        const seed = readSeed(cwd);
        await writeFile(
          path.join(cwd, "varai.realization.json"),
          JSON.stringify({ formatVersion: 1, seedHash: seed.contentHash, bindings: [], witnesses: [] }),
        );
        onEvent?.({ type: "output", stream: "stdout", text: "inline ok\n", truncated: false, at: new Date().toISOString() });
        return { exitCode: 0, signal: null, shell: false };
      },
      async send() {},
      async stop() {},
    });

    const result = await runBuildRun({ repo: root, adapter: "inline-fake", json: true, cache: false });
    assert.equal(result.session.gate.state, GATE_STATES.READY);
  } finally {
    clearAdapters();
    await rm(root, { recursive: true, force: true });
  }
});
