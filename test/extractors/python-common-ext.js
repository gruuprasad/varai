import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/python-common.js";

test("tags packages with ecosystem python", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, "pyproject.toml"), `[tool.poetry.dependencies]
fastapi = "^0.100.0"
`);
  const facts = await extract(dir, ["pyproject.toml"]);
  const pkg = facts.find((f) => f.kind === "package");
  assert.equal(pkg.ecosystem, "python");
});

test("extracts BaseSettings fields as settings_field", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, "config.py"), `from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgres://localhost"
    SECRET_KEY: str = "change-me"
    DEBUG: bool = False
`);
  const facts = await extract(dir, ["config.py"]);
  const fields = facts.filter((f) => f.kind === "settings_field");
  assert.equal(fields.length, 3);
  assert.ok(fields.some((f) => f.name === "DATABASE_URL"));
  assert.ok(fields.some((f) => f.name === "SECRET_KEY"));
  assert.ok(fields.some((f) => f.name === "DEBUG"));
  assert.equal(fields[0].layer, "ast");
});

test("ignores BaseSettings in non-inheriting class", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, "misc.py"), `class NotSettings:
    x: int = 1
`);
  assert.equal((await extract(dir, ["misc.py"])).filter((f) => f.kind === "settings_field").length, 0);
});

test("extracts env vars from .env files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, ".env"), `DATABASE_URL=postgres://localhost
SECRET_KEY=abc123
# THIS_IS_COMMENTED=no
DEBUG=true
`);
  const facts = await extract(dir, [".env"]);
  const envVars = facts.filter((f) => f.kind === "env_var");
  assert.ok(envVars.some((e) => e.name === "DATABASE_URL"));
  assert.ok(envVars.some((e) => e.name === "SECRET_KEY"));
  assert.ok(envVars.some((e) => e.name === "DEBUG"));
  assert.equal(envVars[0].layer, "file");
});

test("extracts env vars from .env.local files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-pycommon-"));
  await writeFile(join(dir, ".env.local"), `API_URL=http://localhost:3000`);
  const facts = await extract(dir, [".env.local"]);
  assert.ok(facts.some((f) => f.kind === "env_var" && f.name === "API_URL"));
});
