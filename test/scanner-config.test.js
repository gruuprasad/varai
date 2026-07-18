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

test("loads include, stock.additional, stock.disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    include: ["src"],
    stock: {
      additional: [{ name: "audit", signatures: [{
        kind: "api_route",
        nameRegex: { pattern: "audit", flags: "i" },
        role: "endpoint",
      }] }],
      disabled: ["health"],
    },
  }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.include, ["src"]);
  assert.equal(cfg.stock.disabled[0], "health");
  assert.equal(cfg.stock.additional[0].name, "audit");
  assert.equal(cfg.stock.additional[0].signatures[0].nameRegex.test("AUDIT"), true);
});

test("invalid stock regex identifies the exact field", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    stock: { additional: [{ name: "audit", signatures: [{
      kind: "api_route", nameRegex: { pattern: "[" }, role: "endpoint",
    }] }] },
  }));
  await assert.rejects(
    () => loadRepoConfig(dir),
    /stock\.additional\[0\]\.signatures\[0\]\.nameRegex: invalid regular expression/,
  );
});

test("partial config: missing stock block is allowed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cfg-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({ include: ["x"] }));
  const cfg = await loadRepoConfig(dir);
  assert.deepEqual(cfg.include, ["x"]);
  assert.equal(cfg.stock, undefined);
});
