import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BUILDER_ENV_BASE_KEYS,
  MAX_EVENT_BYTES,
  buildBuilderEnv,
  createProcessAdapter,
} from "../../src/builder/process-adapter.js";

const fixtureCli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/fake-builder/cli.js",
);

async function tempCwd() {
  const root = await mkdtemp(path.join(tmpdir(), "varai-builder-adapter-"));
  await writeFile(path.join(root, "packet.md"), "# packet\n");
  return root;
}

function collectEvents(adapterStart) {
  const events = [];
  return {
    events,
    onEvent(event) {
      events.push(event);
    },
  };
}

test("buildBuilderEnv allowlists only base keys and drops secrets", () => {
  const env = buildBuilderEnv({
    PATH: "/bin",
    HOME: "/home/dev",
    TERM: "xterm",
    LANG: "C",
    AWS_SECRET_ACCESS_KEY: "leak",
    OPENAI_API_KEY: "sk-nope",
    OTHER: "nope",
  });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.HOME, "/home/dev");
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.OTHER, undefined);
  for (const key of Object.keys(env)) {
    assert.ok(BUILDER_ENV_BASE_KEYS.includes(key) || key.startsWith("LC_"), `unexpected key ${key}`);
  }
});

test("process adapter spawns shell:false and exits 0 for the fake builder", async () => {
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "fake",
      executable: process.execPath,
      args: [fixtureCli, "--mode", "success", "--packet"],
    });
    const { events, onEvent } = collectEvents();
    const result = await adapter.start({
      cwd,
      packetPath: path.join(cwd, "packet.md"),
      onEvent,
    });
    assert.equal(result.exitCode, 0);
    assert.ok(events.some((e) => e.stream === "stdout"));
    assert.equal(result.shell, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("argument packet mode passes packet content to agent-style CLIs", async () => {
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "argument-echo",
      executable: process.execPath,
      args: ["-e", "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write(process.argv[1]))"],
      packetMode: "argument",
    });
    const { events, onEvent } = collectEvents();
    await adapter.start({ cwd, packetPath: path.join(cwd, "packet.md"), onEvent });
    assert.equal(events.find((event) => event.stream === "stdout")?.text, "# packet\n");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("process adapter abort/stop terminates a hanging builder", async () => {
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "fake",
      executable: process.execPath,
      args: [fixtureCli, "--mode", "hang", "--packet"],
    });
    const { onEvent } = collectEvents();
    const started = adapter.start({
      cwd,
      packetPath: path.join(cwd, "packet.md"),
      onEvent,
    });
    await new Promise((r) => setTimeout(r, 100));
    await adapter.stop({ sessionId: "s1" });
    const result = await started;
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.signal === "SIGTERM" || result.signal === "SIGKILL" || result.stopped === true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("non-zero exit is reported without inventing success", async () => {
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "fake",
      executable: process.execPath,
      args: [fixtureCli, "--mode", "fail", "--packet"],
    });
    const { onEvent } = collectEvents();
    const result = await adapter.start({
      cwd,
      packetPath: path.join(cwd, "packet.md"),
      onEvent,
    });
    assert.equal(result.exitCode, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stdout/stderr events are bounded", async () => {
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "fake",
      executable: process.execPath,
      args: [fixtureCli, "--mode", "noisy", "--packet"],
      maxEventBytes: 1024,
    });
    const { events, onEvent } = collectEvents();
    await adapter.start({
      cwd,
      packetPath: path.join(cwd, "packet.md"),
      onEvent,
    });
    const stdout = events.filter((e) => e.stream === "stdout");
    assert.ok(stdout.length > 0);
    for (const event of stdout) {
      assert.ok(Buffer.byteLength(event.text ?? "", "utf8") <= MAX_EVENT_BYTES || event.truncated === true);
      if (adapter.maxEventBytes) {
        assert.ok(Buffer.byteLength(event.text ?? "", "utf8") <= adapter.maxEventBytes || event.truncated);
      }
    }
    assert.ok(stdout.some((e) => e.truncated === true), "noisy output must truncate");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("child process receives filtered environment only", async () => {
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "fake",
      executable: process.execPath,
      args: [fixtureCli, "--mode", "echo-env", "--packet"],
      sourceEnv: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        AWS_SECRET_ACCESS_KEY: "must-not-appear",
        OPENAI_API_KEY: "must-not-appear",
        STRAY: "nope",
      },
    });
    const { events, onEvent } = collectEvents();
    await adapter.start({
      cwd,
      packetPath: path.join(cwd, "packet.md"),
      onEvent,
    });
    const line = events.find((e) => e.stream === "stdout")?.text?.trim();
    const keys = JSON.parse(line);
    assert.ok(keys.includes("PATH"));
    assert.ok(!keys.includes("AWS_SECRET_ACCESS_KEY"));
    assert.ok(!keys.includes("OPENAI_API_KEY"));
    assert.ok(!keys.includes("STRAY"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("buildBuilderEnv honors optional envAllowlist names without leaking others", () => {
  const env = buildBuilderEnv({
    PATH: "/bin",
    HOME: "/home/dev",
    MY_BUILDER_TOKEN: "ok",
    AWS_SECRET_ACCESS_KEY: "nope",
  }, { envAllowlist: ["MY_BUILDER_TOKEN"] });
  assert.equal(env.MY_BUILDER_TOKEN, "ok");
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
});

test("stop() returns promptly even if the child ignores SIGKILL wait bound", async () => {
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "fake",
      executable: process.execPath,
      args: [fixtureCli, "--mode", "hang", "--packet"],
      stopGraceMs: 50,
      stopKillWaitMs: 50,
    });
    const started = adapter.start({
      cwd,
      packetPath: path.join(cwd, "packet.md"),
      onEvent() {},
    });
    await new Promise((r) => setTimeout(r, 80));
    const t0 = Date.now();
    await adapter.stop();
    assert.ok(Date.now() - t0 < 2000, "stop must not hang forever after SIGKILL");
    await started;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("stop kills the whole process group including grandchildren", async () => {
  const { readFile } = await import("node:fs/promises");
  const cwd = await tempCwd();
  try {
    const adapter = createProcessAdapter({
      id: "fake",
      executable: process.execPath,
      args: [fixtureCli, "--mode", "spawn-tree", "--packet"],
      stopGraceMs: 200,
      stopKillWaitMs: 200,
    });
    const started = adapter.start({
      cwd,
      packetPath: path.join(cwd, "packet.md"),
      onEvent() {},
    });
    const marker = path.join(cwd, "grandchild.pid");
    let grandchildPid = null;
    for (let i = 0; i < 40; i++) {
      try {
        grandchildPid = Number(await readFile(marker, "utf8"));
        if (Number.isFinite(grandchildPid) && grandchildPid > 0) break;
      } catch {
        // not written yet
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(grandchildPid, "expected grandchild pid marker");
    await adapter.stop();
    await started;
    await new Promise((r) => setTimeout(r, 100));
    let alive = true;
    try {
      process.kill(grandchildPid, 0);
    } catch {
      alive = false;
    }
    assert.equal(alive, false, "grandchild must not remain after process-group stop");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("start requires an absolute cwd and never falls back to process.cwd()", async () => {
  const { access } = await import("node:fs/promises");
  const worktreeLeak = path.resolve("varai.realization.json");
  try { await rm(worktreeLeak, { force: true }); } catch { /* */ }

  const adapter = createProcessAdapter({
    id: "fake",
    executable: process.execPath,
    args: [fixtureCli, "--mode", "success", "--packet"],
  });

  await assert.rejects(
    () => adapter.start({}),
    /absolute cwd|cwd is required/i,
  );
  await assert.rejects(
    () => adapter.start({ cwd: "relative/tmp" }),
    /absolute cwd/i,
  );
  await assert.rejects(
    () => adapter.start({ cwd: null }),
    /absolute cwd|cwd is required/i,
  );

  // Must not have leaked a realization file into the caller's cwd/worktree.
  let leaked = false;
  try {
    await access(worktreeLeak);
    leaked = true;
  } catch {
    leaked = false;
  }
  assert.equal(leaked, false, "missing cwd must not write ./varai.realization.json");
});
