import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { detectStacks } from "../src/scanners/stack-detect.js";

test("detects fastapi from pyproject.toml", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-detect-"));
  await writeFile(join(dir, "pyproject.toml"), `[tool.poetry.dependencies]\nfastapi = "^0.100.0"\n`);
  const stacks = await detectStacks(dir);
  assert.ok(stacks.has("fastapi"));
});

test("detects sqlalchemy from pyproject.toml", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-detect-"));
  await writeFile(join(dir, "pyproject.toml"), `[tool.poetry.dependencies]\nsqlalchemy = "^2.0.0"\n`);
  const stacks = await detectStacks(dir);
  assert.ok(stacks.has("sqlalchemy"));
});

test("detects fastapi from requirements.txt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-detect-"));
  await writeFile(join(dir, "requirements.txt"), "fastapi==0.100.0\nuvicorn==0.23.0\n");
  const stacks = await detectStacks(dir);
  assert.ok(stacks.has("fastapi"));
});

test("detects react-vite from package.json vite dep", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-detect-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { react: "^18", vite: "^5" } }));
  const stacks = await detectStacks(dir);
  assert.ok(stacks.has("react-vite"));
});

test("detects python-common whenever pyproject.toml exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-detect-"));
  await writeFile(join(dir, "pyproject.toml"), "[tool.poetry]\nname = \"myapp\"\n");
  const stacks = await detectStacks(dir);
  assert.ok(stacks.has("python-common"));
});

test("empty dir returns empty set", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-detect-"));
  const stacks = await detectStacks(dir);
  assert.equal(stacks.size, 0);
});
