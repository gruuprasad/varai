import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runMap } from "../src/map.js";

test("varai.config.json include paths are used when no CLI --include", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-map-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    include: ["only_this"]
  }));
  await mkdir(join(dir, "only_this"), { recursive: true });
  await writeFile(join(dir, "only_this/a.py"), "");
  await mkdir(join(dir, "not_this"), { recursive: true });
  await writeFile(join(dir, "not_this/b.py"), "");

  const { scan } = await runMap({ repo: dir });
  assert.ok(scan.files.some((f) => f.startsWith("only_this")));
  assert.ok(!scan.files.some((f) => f.startsWith("not_this")));
});

test("varai.config.json exclusions are applied", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-map-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({ include: ["src"], exclude: ["src/generated.js"] }));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/keep.js"), "");
  await writeFile(join(dir, "src/generated.js"), "");

  const { scan } = await runMap({ repo: dir });
  assert.ok(scan.files.includes("src/keep.js"));
  assert.ok(!scan.files.includes("src/generated.js"));
});

test("CLI --include overrides varai.config.json include", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-map-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    include: ["ignored"]
  }));
  await mkdir(join(dir, "ignored"), { recursive: true });
  await writeFile(join(dir, "ignored/a.py"), "");
  await mkdir(join(dir, "cli_only"), { recursive: true });
  await writeFile(join(dir, "cli_only/b.py"), "");

  const { scan } = await runMap({ repo: dir, include: ["cli_only"] });
  assert.ok(!scan.files.some((f) => f.startsWith("ignored")));
  assert.ok(scan.files.some((f) => f.startsWith("cli_only")));
});

test("missing varai.config.json works fine", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-map-"));
  await writeFile(join(dir, "any.py"), "");

  const { scan } = await runMap({ repo: dir });
  assert.ok(scan.files.includes("any.py"));
});
