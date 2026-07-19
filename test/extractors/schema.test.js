import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/schema.js";

async function setup() {
  return mkdtemp(join(tmpdir(), "varai-schema-"));
}

test("extracts Pydantic BaseModel subclasses as schema facts", async () => {
  const dir = await setup();
  await writeFile(join(dir, "schemas.py"), [
    "from pydantic import BaseModel",
    "class UserCreate(BaseModel):",
    "    name: str",
    "    email: str",
    "class UserResponse(BaseModel):",
    "    id: int",
    "    name: str",
  ].join("\n"));
  const facts = await extract(dir, ["schemas.py"]);
  assert.equal(facts.filter((f) => f.kind === "schema").length, 2);
  assert.ok(facts.some((f) => f.name === "UserCreate" && f.evidence[0].file === "schemas.py"));
  assert.ok(facts.some((f) => f.name === "UserResponse"));
});

test("records correct line numbers", async () => {
  const dir = await setup();
  await writeFile(join(dir, "models.py"), [
    "from pydantic import BaseModel",
    "",
    "class FirstModel(BaseModel):",
    "    x: int",
    "",
    "class SecondModel(BaseModel):",
    "    y: str",
  ].join("\n"));
  const facts = await extract(dir, ["models.py"]);
  const first = facts.find((f) => f.name === "FirstModel");
  const second = facts.find((f) => f.name === "SecondModel");
  assert.equal(first.evidence[0].line, 3);
  assert.equal(second.evidence[0].line, 6);
});

test("does not emit non-BaseModel classes as schemas", async () => {
  const dir = await setup();
  await writeFile(join(dir, "models.py"), [
    "class PlainClass:",
    "    pass",
    "class SQLModel(Base):",
    "    pass",
    "class RealSchema(BaseModel):",
    "    value: int",
  ].join("\n"));
  const facts = await extract(dir, ["models.py"]);
  assert.ok(!facts.some((f) => f.name === "PlainClass"), "plain class not emitted");
  assert.ok(!facts.some((f) => f.name === "SQLModel"), "non-BaseModel class not emitted");
  assert.ok(facts.some((f) => f.name === "RealSchema"), "BaseModel subclass emitted");
});

test("skips files without BaseModel (pre-guard)", async () => {
  const dir = await setup();
  await writeFile(join(dir, "utils.py"), "def helper():\n    pass\n");
  const facts = await extract(dir, ["utils.py"]);
  assert.equal(facts.length, 0, "no parse on files without BaseModel");
});

test("extracts schema facts with ast layer", async () => {
  const dir = await setup();
  await writeFile(join(dir, "s.py"), "from pydantic import BaseModel\nclass Req(BaseModel):\n    x: int\n");
  const facts = await extract(dir, ["s.py"]);
  assert.equal(facts[0].layer, "ast");
});

test("extracts schemas that inherit from another Pydantic schema", async () => {
  const dir = await setup();
  await writeFile(join(dir, "base.py"), "from pydantic import BaseModel\nclass CatalogResponse(BaseModel):\n    items: list\n");
  await writeFile(join(dir, "derived.py"), "from base import CatalogResponse\nclass MutationResponse(CatalogResponse):\n    item_id: str\n");

  const facts = await extract(dir, ["base.py", "derived.py"]);

  assert.ok(facts.some((item) => item.name === "CatalogResponse"));
  assert.ok(facts.some((item) => item.name === "MutationResponse"));
});
