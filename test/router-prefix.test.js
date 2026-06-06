import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildPrefixMap } from "../src/scanners/router-prefix.js";
import { createScanContext } from "../src/scanners/context.js";

test("resolves simple app.include_router prefix", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-prefix-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "main.py"), `from routes.auth import router as auth_router
app.include_router(auth_router, prefix="/api/auth")
`);
  await writeFile(join(dir, "routes/auth.py"), `router = APIRouter()
@router.post("/login")
async def login(): pass
`);
  const files = ["main.py", "routes/auth.py"];
  const ctx = createScanContext(dir);
  const pm = await buildPrefixMap(files, ctx);
  assert.equal(pm.get("routes/auth.py"), "/api/auth");
});

test("resolves app.include_router without prefix as empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-prefix-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "main.py"), `from routes.health import router as health_router
app.include_router(health_router)
`);
  await writeFile(join(dir, "routes/health.py"), `router = APIRouter()
@router.get("/health")
async def health(): pass
`);
  const files = ["main.py", "routes/health.py"];
  const ctx = createScanContext(dir);
  const pm = await buildPrefixMap(files, ctx);
  assert.equal(pm.get("routes/health.py"), "");
});

test("unresolvable imports produce no prefix (fallback)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-prefix-"));
  await writeFile(join(dir, "main.py"), `app.include_router(auth_router, prefix="/api/auth")
`);
  const files = ["main.py"];
  const ctx = createScanContext(dir);
  const pm = await buildPrefixMap(files, ctx);
  assert.equal(pm.size, 0);
});

test("handles alias imports for prefix resolution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-prefix-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "main.py"), `from routes.users import router as users_router
app.include_router(users_router, prefix="/api/users")
`);
  await writeFile(join(dir, "routes/users.py"), `router = APIRouter()
@router.get("/me")
async def me(): pass
`);
  const files = ["main.py", "routes/users.py"];
  const ctx = createScanContext(dir);
  const pm = await buildPrefixMap(files, ctx);
  assert.equal(pm.get("routes/users.py"), "/api/users");
});

test("no python files returns empty prefix map", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-prefix-"));
  const ctx = createScanContext(dir);
  const pm = await buildPrefixMap(["README.md"], ctx);
  assert.equal(pm.size, 0);
});

test("recursive include_router propagates prefix", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-prefix-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "main.py"), `from routes.building import router as building_router
app.include_router(building_router, prefix="/api/v1")
`);
  await writeFile(join(dir, "routes/building.py"), `from routes.sub1 import router as sub1_router
router = APIRouter()
router.include_router(sub1_router)
`);
  await writeFile(join(dir, "routes/sub1.py"), `router = APIRouter()
@router.get("/items")
async def items(): pass
`);
  const files = ["main.py", "routes/building.py", "routes/sub1.py"];
  const ctx = createScanContext(dir);
  const pm = await buildPrefixMap(files, ctx);
  assert.equal(pm.get("routes/building.py"), "/api/v1");
});

test("APIRouter with own prefix combines with mounted prefix", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-prefix-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "main.py"), `from routes.auth import router as auth_router
app.include_router(auth_router, prefix="/api/auth")
`);
  await writeFile(join(dir, "routes/auth.py"), `router = APIRouter(prefix="/v2")
@router.post("/login")
async def login(): pass
`);
  const files = ["main.py", "routes/auth.py"];
  const ctx = createScanContext(dir);
  const pm = await buildPrefixMap(files, ctx);
  assert.equal(pm.get("routes/auth.py"), "/api/auth/v2");
});
