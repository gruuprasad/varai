import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/sqlalchemy.js";

test("extracts SQLAlchemy models from class X(Base) pattern", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sqla-"));
  await writeFile(join(dir, "models.py"), `from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"
    id: int

class Project(Base):
    __tablename__ = "projects"
    id: int
`);
  const facts = await extract(dir, ["models.py"]);
  const models = facts.filter((f) => f.kind === "db_model");
  assert.equal(models.length, 2);
  assert.ok(models.some((m) => m.name === "User"));
  assert.ok(models.some((m) => m.name === "Project"));
  assert.equal(models[0].layer, "ast");
  assert.equal(models[0].evidence[0].file, "models.py");
  assert.ok(typeof models[0].evidence[0].line === "number");
});

test("does not extract Base class itself", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sqla-"));
  await writeFile(join(dir, "base.py"), `class Base(DeclarativeBase):\n    pass\n`);
  const facts = await extract(dir, ["base.py"]);
  assert.equal(facts.filter((f) => f.kind === "db_model").length, 0);
});

test("detects alembic migrations from versions directory path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sqla-"));
  const facts = await extract(dir, [
    "alembic/versions/001_initial.py",
    "alembic/versions/002_add_projects.py"
  ]);
  const migrations = facts.filter((f) => f.kind === "database_migration");
  assert.equal(migrations.length, 2);
  assert.equal(migrations[0].layer, "heuristic");
});

test("ignores non-python files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-sqla-"));
  await writeFile(join(dir, "schema.json"), `{"note": "class User(Base): pass"}`);
  assert.equal((await extract(dir, ["schema.json"])).length, 0);
});
