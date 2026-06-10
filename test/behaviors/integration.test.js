import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { renderInventory } from "../../src/reporters/inventory.js";

test("scanRepo attaches behaviors and renderInventory shows the section", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-bint-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "pyproject.toml"), `[project]\nname="x"\ndependencies=["fastapi"]\n`);
  await writeFile(join(dir, "routes/auth.py"), `from fastapi import APIRouter, Depends
router = APIRouter()

class LoginRequest: pass

@router.post("/api/auth/login")
def login(data: LoginRequest, db = Depends(get_db)):
    raise HTTPException(status_code=401, detail="no")

@router.post("/api/auth/signup")
def signup(data: LoginRequest, db = Depends(get_db)):
    return data
`);
  const scan = await scanRepo(dir, { cache: false });
  assert.ok(scan.behaviors, "scan.behaviors attached");
  assert.ok(scan.behaviors.bundles.length >= 1);

  const md = renderInventory({ repoPath: dir, scan });
  assert.ok(md.includes("## Behaviors"));
  assert.ok(md.includes("/api/auth/login"));
});
