import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";

test("scanRepo tags facts and includes `stock` in output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-stock-int-"));
  await writeFile(join(dir, "pyproject.toml"), "[project]\ndependencies = [\"fastapi\",\"sqlalchemy\",\"stripe\",\"pydantic\"]\n");
  await writeFile(join(dir, ".env"), "STRIPE_SECRET_KEY=\nJWT_SECRET=\nDATABASE_URL=\n");
  await mkdir(join(dir, "app"), { recursive: true });
  await writeFile(join(dir, "app/main.py"),
    "from fastapi import FastAPI, APIRouter\n" +
    "router = APIRouter()\n" +
    "@router.post(\"/api/auth/login\")\n" +
    "async def login():\n    pass\n");
  await mkdir(join(dir, "app/models"), { recursive: true });
  await writeFile(join(dir, "app/models/user.py"),
    "from sqlalchemy.orm import declarative_base\n" +
    "Base = declarative_base()\n" +
    "class User(Base):\n    pass\n");

  const { facts } = await scanRepo(dir, { cache: false });
  const stripe = facts.find((f) => f.kind === "package" && f.name === "stripe");
  const jwt = facts.find((f) => f.kind === "env_var" && f.name === "JWT_SECRET");
  const stripeEnv = facts.find((f) => f.kind === "env_var" && f.name === "STRIPE_SECRET_KEY");
  const user = facts.find((f) => f.kind === "db_model" && f.name === "User");
  const login = facts.find((f) => f.kind === "api_route" && /login/.test(f.name));

  assert.ok(stripe?.stock?.includes("payment"),     "stripe package tagged payment");
  assert.ok(jwt?.stock?.includes("auth"),           "JWT env tagged auth");
  assert.ok(stripeEnv?.stock?.includes("payment"),  "STRIPE_ env tagged payment");
  assert.ok(login?.stock?.includes("auth"),         "auth login route tagged auth");
  if (user) assert.ok(user.stock?.includes("auth"), "User model in app/models/user.py tagged auth");
});

test("scanRepo honors stock.disabled in varai.config.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-stock-int-"));
  await writeFile(join(dir, "varai.config.json"), JSON.stringify({
    stock: { disabled: ["auth"] },
  }));
  await writeFile(join(dir, ".env"), "JWT_SECRET=\n");

  const { facts } = await scanRepo(dir, { cache: false });
  const jwt = facts.find((f) => f.kind === "env_var" && f.name === "JWT_SECRET");
  assert.equal(jwt?.stock, undefined, "auth disabled => no auth tag on JWT_SECRET");
});
