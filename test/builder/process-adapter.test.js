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
