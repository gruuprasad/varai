import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { findHandlers } from "../../src/scanners/behaviors/handlers.js";

test("findHandlers pairs each route fact with its handler function node", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-handlers-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "routes/auth.py"), `from fastapi import APIRouter
router = APIRouter()

@router.post("/api/auth/login")
def login(data):
    return data
`);
  const ctx = createScanContext(dir);
  const routeFacts = [
    { kind: "api_route", name: "POST /api/auth/login", evidence: [{ file: "routes/auth.py", line: 4 }], layer: "ast" },
  ];
  const handlers = await findHandlers(routeFacts, ctx);
  assert.equal(handlers.length, 1);
  assert.equal(handlers[0].door.method, "POST");
  assert.equal(handlers[0].door.path, "/api/auth/login");
  assert.equal(handlers[0].door.evidence.file, "routes/auth.py");
  assert.equal(handlers[0].handlerNode.type, "function_definition");
  assert.equal(handlers[0].handlerNode.childForFieldName("name").text, "login");
});
