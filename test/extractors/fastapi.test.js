import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/fastapi.js";

test("extracts GET and POST routes from @router decorators", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-fastapi-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "routes/auth.py"), `from fastapi import APIRouter
router = APIRouter()

@router.post("/api/auth/login")
async def login():
    pass

@router.get("/api/auth/me")
async def me():
    pass
`);

  const facts = await extract(dir, ["routes/auth.py"]);
  const routes = facts.filter((f) => f.kind === "api_route");
  assert.equal(routes.length, 2);
  assert.ok(routes.some((r) => r.name === "POST /api/auth/login"));
  assert.ok(routes.some((r) => r.name === "GET /api/auth/me"));
  assert.equal(routes[0].layer, "ast");
  assert.equal(routes[0].evidence[0].file, "routes/auth.py");
  assert.ok(typeof routes[0].evidence[0].line === "number");
});

test("does NOT match a route-looking string inside a comment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-fastapi-"));
  await writeFile(join(dir, "noise.py"), `# @router.get("/api/ghost")
x = '@app.post("/api/also-ghost")'
y = 1
`);
  const facts = await extract(dir, ["noise.py"]);
  assert.equal(facts.filter((f) => f.kind === "api_route").length, 0,
    "routes in comments/strings must not be extracted");
});

test("extracts routes from @app decorators", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-fastapi-"));
  await writeFile(join(dir, "main.py"), `from fastapi import FastAPI
app = FastAPI()

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: int):
    pass
`);
  const facts = await extract(dir, ["main.py"]);
  assert.equal(facts.filter((f) => f.kind === "api_route").length, 1);
  assert.equal(facts.find((f) => f.kind === "api_route").name, "DELETE /api/items/{item_id}");
});

test("emits webhook_route for paths containing 'webhook'", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-fastapi-"));
  await writeFile(join(dir, "webhooks.py"), `@app.post("/webhooks/stripe")\nasync def stripe_webhook(): pass\n`);
  const facts = await extract(dir, ["webhooks.py"]);
  assert.ok(facts.some((f) => f.kind === "webhook_route" && f.name === "POST /webhooks/stripe"));
  assert.ok(facts.some((f) => f.kind === "api_route" && f.name === "POST /webhooks/stripe"));
});

test("ignores non-python files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-fastapi-"));
  await writeFile(join(dir, "README.md"), "@app.get('/foo')");
  assert.equal((await extract(dir, ["README.md"])).length, 0);
});
