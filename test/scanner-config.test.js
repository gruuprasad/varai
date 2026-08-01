import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { loadRepoConfig } from "../src/scanners/config.js";

test("missing varai.config.json returns empty object", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg, {});
});

test("malformed varai.config.json reports a precise error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), "{ this is not json");
  await assert.rejects(() => loadRepoConfig(dir), /varai\.config\.json: root: invalid JSON/);
});

test("loads include and exclude paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({ include: ["src"], exclude: ["src/generated.ts"] }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg, { include: ["src"], exclude: ["src/generated.ts"] });
});

test("unknown fields are rejected instead of silently ignored", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({ stock: {} }));
  await assert.rejects(() => loadRepoConfig(dir), /varai\.config\.json: stock: unknown field/);
});

test("loads builders adapter configs alongside include/exclude", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    include: ["src"],
    builders: {
      fake: { executable: "/usr/bin/node", args: ["fake.js"] },
    },
  }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.include, ["src"]);
  assert.deepEqual(cfg.builders.fake, { executable: "/usr/bin/node", args: ["fake.js"] });
});

test("rejects builder entries without executable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    builders: { fake: { args: ["x"] } },
  }));
  await assert.rejects(() => loadRepoConfig(dir), /builders\.fake\.executable/);
});

test("loads optional builder envAllowlist as names only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    builders: {
      fake: {
        executable: "/usr/bin/node",
        args: ["fake.js"],
        envAllowlist: ["MY_BUILDER_TOKEN", "OTHER_OK"],
      },
    },
  }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.builders.fake.envAllowlist, ["MY_BUILDER_TOKEN", "OTHER_OK"]);
});

test("loads agent-compatible builder packet mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    builders: {
      codex: { executable: "codex", args: ["exec"], packetMode: "argument" },
    },
  }));
  const cfg = await loadRepoConfig(dir);
  assert.equal(cfg.builders.codex.packetMode, "argument");
});

test("rejects unknown builder packet modes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    builders: { codex: { executable: "codex", packetMode: "stdin" } },
  }));
  await assert.rejects(() => loadRepoConfig(dir), /packetMode/);
});

test("rejects non-string envAllowlist entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    builders: {
      fake: { executable: "/usr/bin/node", envAllowlist: [1] },
    },
  }));
  await assert.rejects(() => loadRepoConfig(dir), /envAllowlist/);
});

test("loads a local command Seed assistant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    assistant: { executable: "codex", args: ["exec", "--ephemeral"] },
  }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.assistant, { executable: "codex", args: ["exec", "--ephemeral"] });
});
