import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import {
  behavioralEnvelopes,
  systemPaths,
} from "../../src/system-model/projections/index.js";

const nextFixture = path.resolve("test/fixtures/nextjs-api-join");

function spineStats(model) {
  const operations = model.elements.filter((item) => item.kind === "operation");
  const referenceInvokes = model.claims.filter((claim) =>
    claim.relation === "invokes" && claim.target.kind === "reference");
  const paths = systemPaths(model).paths;
  const envelopes = behavioralEnvelopes(model).envelopes;
  return {
    operations: operations.length,
    referenceInvokes: referenceInvokes.length,
    paths: paths.length,
    envelopes: envelopes.length,
  };
}

test("mechanism→envelope spine gate: Next.js fixture forms reference invokes and envelopes", async () => {
  const model = (await scanRepo(nextFixture, {
    cache: false,
    jobs: 1,
    systemName: "spine-gate-nextjs",
  })).model;
  const stats = spineStats(model);
  assert.ok(stats.operations > 0, "operations recovered");
  assert.ok(stats.referenceInvokes > 0, "UI invokes bind to operations");
  assert.ok(stats.paths > 0, "system paths form");
  assert.ok(stats.envelopes > 0, "behavioral envelopes form");
});

test("mechanism→envelope spine gate: named FastAPI routers recover prefixed operations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-spine-fastapi-"));
  await mkdir(join(dir, "routers"), { recursive: true });
  await writeFile(join(dir, "pyproject.toml"), `[project]\nname = "spine"\ndependencies = ["fastapi>=0.110"]\n`);
  await writeFile(join(dir, "main.py"), `from routers.content import api_content
from fastapi import FastAPI
app = FastAPI()
app.include_router(api_content, prefix="/api/content")
`);
  await writeFile(join(dir, "routers/content.py"), `from fastapi import APIRouter
api_content = APIRouter()

@api_content.put("")
async def put_root():
    return {"ok": True}

@api_content.get("/github")
async def github():
    return []
`);

  const model = (await scanRepo(dir, {
    cache: false,
    jobs: 1,
    systemName: "spine-gate-fastapi",
  })).model;
  const names = model.elements.filter((item) => item.kind === "operation").map((item) => item.name).sort();
  assert.ok(names.includes("PUT /api/content"));
  assert.ok(names.includes("GET /api/content/github"));
});
