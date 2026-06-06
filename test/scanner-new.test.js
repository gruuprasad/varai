import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";

test(".worktrees directory is skipped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-scanner-"));
  await mkdir(join(dir, ".worktrees/some-feature"), { recursive: true });
  await writeFile(join(dir, ".worktrees/some-feature/.env"), "SECRET=123");
  await writeFile(join(dir, "main.py"), "");

  const scan = await scanRepo(dir);
  assert.ok(!scan.files.some((f) => f.includes(".worktrees")));
  assert.ok(scan.files.includes("main.py"));
});

test("gitignore patterns are honored when gitignore option is true", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-scanner-"));
  await writeFile(join(dir, ".gitignore"), "generated.py\nbuild/\n");
  await mkdir(join(dir, "build"), { recursive: true });
  await writeFile(join(dir, "build/output.py"), "");
  await writeFile(join(dir, "generated.py"), "");
  await writeFile(join(dir, "main.py"), "");

  const scan = await scanRepo(dir, { gitignore: true });
  assert.ok(!scan.files.includes("build/output.py"));
  assert.ok(!scan.files.includes("generated.py"));
  assert.ok(scan.files.includes("main.py"));
});

test("gitignore=false disables gitignore filtering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-scanner-"));
  await writeFile(join(dir, ".gitignore"), "generated.py\n");
  await writeFile(join(dir, "generated.py"), "");
  await writeFile(join(dir, "main.py"), "");

  const scan = await scanRepo(dir, { gitignore: false });
  assert.ok(scan.files.includes("generated.py"));
  assert.ok(scan.files.includes("main.py"));
});
