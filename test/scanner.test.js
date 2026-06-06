import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";

test("--include filters to matching path prefixes only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-scanner-"));
  await mkdir(join(dir, "services/backend"), { recursive: true });
  await mkdir(join(dir, "other"), { recursive: true });
  await writeFile(join(dir, "services/backend/routes.py"), "");
  await writeFile(join(dir, "other/file.js"), "");

  const scan = await scanRepo(dir, { include: ["services/backend"] });
  assert.ok(scan.files.every((f) => f.startsWith("services/backend")));
  assert.ok(!scan.files.includes("other/file.js"));
});

test("no include option walks whole repo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-scanner-"));
  await mkdir(join(dir, "services/backend"), { recursive: true });
  await mkdir(join(dir, "other"), { recursive: true });
  await writeFile(join(dir, "services/backend/routes.py"), "");
  await writeFile(join(dir, "other/file.js"), "");

  const scan = await scanRepo(dir);
  assert.ok(scan.files.includes("services/backend/routes.py"));
  assert.ok(scan.files.includes("other/file.js"));
});

test("fastapi routes appear when pyproject.toml declares fastapi", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-scanner-"));
  await writeFile(join(dir, "pyproject.toml"), `[tool.poetry.dependencies]\nfastapi = "^0.100.0"\n`);
  await writeFile(join(dir, "routes.py"), `@router.get("/api/items")\nasync def list_items(): pass\n`);

  const scan = await scanRepo(dir);
  assert.ok(scan.facts.some((f) => f.kind === "api_route" && f.name === "GET /api/items"));
});

test("python cache directories are skipped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-scanner-"));
  await mkdir(join(dir, "__pycache__"), { recursive: true });
  await writeFile(join(dir, "__pycache__/module.cpython-311.pyc"), "binary");
  await writeFile(join(dir, "main.py"), "");

  const scan = await scanRepo(dir);
  assert.ok(!scan.files.some((f) => f.includes("__pycache__")));
  assert.ok(scan.files.includes("main.py"));
});
