import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract, routePathFromFile } from "../../src/scanners/extractors/nextjs.js";
import { createScanContext } from "../../src/scanners/context.js";

test("routePathFromFile maps App Router and strips route groups", () => {
  assert.equal(routePathFromFile("app/api/workspaces/route.ts"), "/api/workspaces");
  assert.equal(routePathFromFile("app/api/workspaces/route.js"), "/api/workspaces");
  assert.equal(
    routePathFromFile("app/(ee)/api/teams/[teamId]/documents/route.ts"),
    "/api/teams/*/documents",
  );
});

test("routePathFromFile maps Pages API index and dynamic segments", () => {
  assert.equal(
    routePathFromFile("pages/api/teams/[teamId]/documents/index.ts"),
    "/api/teams/*/documents",
  );
  assert.equal(
    routePathFromFile("pages/api/teams/[teamId]/documents/index.js"),
    "/api/teams/*/documents",
  );
  assert.equal(
    routePathFromFile("pages/api/teams/[teamId]/ai-settings.ts"),
    "/api/teams/*/ai-settings",
  );
});

test("extracts exported App Router handlers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-nextjs-"));
  await mkdir(join(dir, "app/api/workspaces"), { recursive: true });
  await writeFile(join(dir, "app/api/workspaces/route.js"), `export async function POST() {}\nexport async function GET() {}\n`);
  const facts = await extract(dir, ["app/api/workspaces/route.js"], createScanContext(dir));
  const names = facts.map((f) => f.name).sort();
  assert.deepEqual(names, ["GET /api/workspaces", "POST /api/workspaces"]);
});

test("extracts Pages API method branches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-nextjs-"));
  await mkdir(join(dir, "pages/api/teams/[teamId]/documents"), { recursive: true });
  await writeFile(join(dir, "pages/api/teams/[teamId]/documents/index.js"), `
export default async function handle(req, res) {
  if (req.method === "GET") return res.json([]);
  if (req.method === "POST") return res.status(201).json({ ok: true });
}
`);
  const facts = await extract(
    dir,
    ["pages/api/teams/[teamId]/documents/index.js"],
    createScanContext(dir),
  );
  const names = facts.map((f) => f.name).sort();
  assert.deepEqual(names, ["GET /api/teams/*/documents", "POST /api/teams/*/documents"]);
});
