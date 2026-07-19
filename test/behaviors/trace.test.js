import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createScanContext } from "../../src/scanners/context.js";
import { traceBehaviors } from "../../src/scanners/behaviors/index.js";

test("traceBehaviors produces a full behavior for a login route", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-trace-"));
  await mkdir(join(dir, "routes"), { recursive: true });
  await writeFile(join(dir, "routes/auth.py"), `from fastapi import APIRouter, Depends
router = APIRouter()

class LoginRequest: pass
class LoginResponse: pass

@router.post("/api/auth/login", response_model=LoginResponse)
def login(data: LoginRequest, db = Depends(get_db)):
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=401, detail="no")
    return LoginResponse()
`);
  const ctx = createScanContext(dir);
  const facts = [
    { kind: "api_route", name: "POST /api/auth/login", evidence: [{ file: "routes/auth.py", line: 7 }], layer: "ast" },
    { kind: "schema", name: "LoginRequest", evidence: [{ file: "routes/auth.py", line: 4 }], layer: "ast" },
    { kind: "schema", name: "LoginResponse", evidence: [{ file: "routes/auth.py", line: 5 }], layer: "ast" },
    { kind: "db_model", name: "User", evidence: [{ file: "routes/auth.py", line: 1 }], layer: "ast" },
  ];
  const behaviors = await traceBehaviors(dir, ["routes/auth.py"], ctx, facts);

  assert.equal(behaviors.length, 1);
  const b = behaviors[0];
  assert.equal(b.door.path, "/api/auth/login");
  assert.ok(b.requires.some((r) => r.name === "get_db"));
  assert.ok(b.takes.some((t) => t.schema === "LoginRequest"));
  assert.ok(b.gives.some((g) => g.schema === "LoginResponse"));
  assert.ok(b.reads.some((r) => r.target === "User"));
  assert.ok(b.fails.some((f) => f.status === 401));
});
