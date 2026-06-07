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

test("malformed varai.config.json returns empty object (does not throw)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), "{ this is not json");
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg, {});
});

test("loads include, stock.additional, stock.disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    include: ["src"],
    stock: {
      additional: [{ name: "audit", signatures: [{ kind: "api_route", nameRegex: /audit/i, role: "endpoint" }] }],
      disabled: ["health"],
    },
  }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.include, ["src"]);
  assert.equal(cfg.stock.disabled[0], "health");
  assert.equal(cfg.stock.additional[0].name, "audit");
});

test("partial config: missing stock block is allowed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({ include: ["x"] }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.include, ["x"]);
  assert.equal(cfg.stock, undefined);
});
