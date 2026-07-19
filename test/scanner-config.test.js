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
