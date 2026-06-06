import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/python-common.js";

test("extracts packages from pyproject.toml [tool.poetry.dependencies]", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, "pyproject.toml"), `[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.100.0"
sqlalchemy = "^2.0.0"
alembic = "^1.12.0"
`);
  const facts = await extract(dir, ["pyproject.toml"]);
  const packages = facts.filter((f) => f.kind === "package");
  assert.ok(packages.some((p) => p.name === "fastapi"));
  assert.ok(packages.some((p) => p.name === "sqlalchemy"));
  assert.ok(packages.some((p) => p.name === "alembic"));
  assert.ok(!packages.some((p) => p.name === "python"), "python itself must be skipped");
  assert.equal(packages[0].layer, "heuristic");
  assert.equal(packages[0].evidence[0].file, "pyproject.toml");
});

test("extracts packages from pyproject.toml [project] dependencies list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, "pyproject.toml"), `[project]
dependencies = [
  "fastapi>=0.100.0",
  "httpx>=0.24.0",
]
`);
  const facts = await extract(dir, ["pyproject.toml"]);
  const packages = facts.filter((f) => f.kind === "package");
  assert.ok(packages.some((p) => p.name === "fastapi"));
  assert.ok(packages.some((p) => p.name === "httpx"));
});

test("extracts env vars from os.environ and os.getenv in Python files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, "config.py"), `import os
DATABASE_URL = os.environ["DATABASE_URL"]
SECRET = os.getenv("JWT_SECRET")
DEBUG = os.environ.get("DEBUG", "false")
`);
  const facts = await extract(dir, ["config.py"]);
  const envVars = facts.filter((f) => f.kind === "env_var");
  assert.ok(envVars.some((e) => e.name === "DATABASE_URL"));
  assert.ok(envVars.some((e) => e.name === "JWT_SECRET"));
  assert.ok(envVars.some((e) => e.name === "DEBUG"));
  assert.equal(envVars[0].layer, "heuristic");
});

test("deduplicates env vars seen in multiple files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, "a.py"), `import os\nDB = os.environ["DATABASE_URL"]\n`);
  await writeFile(join(dir, "b.py"), `import os\nDB = os.environ["DATABASE_URL"]\n`);
  const facts = await extract(dir, ["a.py", "b.py"]);
  assert.equal(facts.filter((f) => f.kind === "env_var" && f.name === "DATABASE_URL").length, 1);
});
