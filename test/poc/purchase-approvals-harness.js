import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const VARAI_ROOT = path.resolve(here, "../..");

// Sibling of the Varai repo root (next to varai-slotkeeper-pilot), not inside fixtures.
// From this worktree: ../../../.. = jodulabs/. Env VARAI_POC_PATH overrides.
export const DEFAULT_POC_PATH = path.resolve(
  process.env.VARAI_POC_PATH
    ?? path.join(VARAI_ROOT, "../../../..", "varai-purchase-approvals-poc"),
);

export const POC_ENV = {
  ...process.env,
  PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
  VARAI_POC_EMPLOYEE_1_TOKEN: "employee-1-token",
  VARAI_POC_EMPLOYEE_2_TOKEN: "employee-2-token",
  VARAI_POC_MANAGER_TOKEN: "manager-1-token",
  VARAI_POC_FINANCE_TOKEN: "finance-1-token",
};

export function assertPocExists(pocPath = DEFAULT_POC_PATH) {
  if (!fs.existsSync(pocPath)) {
    throw new Error(`Purchase-approvals POC missing at ${pocPath}`);
  }
  if (!fs.existsSync(path.join(pocPath, "varai.seed.json"))) {
    throw new Error(`POC at ${pocPath} has no varai.seed.json`);
  }
  return pocPath;
}

function shouldSkip(name) {
  return name === ".varai"
    || name === ".venv"
    || name === "node_modules"
    || name === ".git"
    || name.endsWith(".db")
    || name === "__pycache__";
}

/** Fresh writable copy of the sibling POC for one adversarial trial. */
export function clonePoc(label = "trial") {
  const source = assertPocExists();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `varai-pa-${label}-`));
  fs.cpSync(source, root, {
    recursive: true,
    filter: (src) => !shouldSkip(path.basename(src)),
  });
  const venv = path.join(source, ".venv");
  if (fs.existsSync(venv)) fs.symlinkSync(venv, path.join(root, ".venv"), "dir");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "trial@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Trial"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "trial base"]);
  return root;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function patchFile(filePath, transform) {
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`Patch produced no change for ${filePath}`);
  fs.writeFileSync(filePath, after);
}

export function syncSeedHash(repoPath) {
  const seed = readJson(path.join(repoPath, "varai.seed.json"));
  const hash = seed.ratification?.contentHash;
  if (!hash) throw new Error("Seed is not ratified");
  for (const name of ["varai.realization.json", "varai.runtime.json"]) {
    const file = path.join(repoPath, name);
    const data = readJson(file);
    data.seedHash = hash;
    writeJson(file, data);
  }
  return hash;
}

export function mutateOmitAudit(repoPath) {
  patchFile(path.join(repoPath, "backend/app/decisions.py"), (src) => src.replace(
    "def write_audit(db: Session, request_id: str, decision: str, actor_id: str) -> None:\n  db.add(AuditEntry(request_id=request_id, decision=decision, actor_id=actor_id))\n",
    "def write_audit(db: Session, request_id: str, decision: str, actor_id: str) -> None:\n  return\n",
  ));
}

export function mutateInvertAuth(repoPath) {
  patchFile(path.join(repoPath, "backend/app/main.py"), (src) => src.replace(
    `  if record.owner_id != user["id"]:
    raise HTTPException(status_code=403, detail="not allowed")
  record.state = "withdrawn"
  write_audit(db, request_id, "withdrawn", user["id"])`,
    `  if record.owner_id != user["id"]:
    # inverted authorization fault: non-owner withdraw succeeds
    pass
  elif False:
    raise HTTPException(status_code=403, detail="not allowed")
  record.state = "withdrawn"
  write_audit(db, request_id, "withdrawn", user["id"])`,
  ));
}

export function mutateCorruptDeny(repoPath) {
  patchFile(path.join(repoPath, "backend/app/main.py"), (src) => src.replace(
    `  if record.owner_id != user["id"]:
    raise HTTPException(status_code=403, detail="not allowed")
  record.state = "withdrawn"
  write_audit(db, request_id, "withdrawn", user["id"])
  db.commit()
  db.refresh(record)
  return request_to_dict(record)`,
    `  if record.owner_id != user["id"]:
    record.state = "withdrawn"
    write_audit(db, request_id, "withdrawn", user["id"])
    db.commit()
    raise HTTPException(status_code=403, detail="not allowed")
  record.state = "withdrawn"
  write_audit(db, request_id, "withdrawn", user["id"])
  db.commit()
  db.refresh(record)
  return request_to_dict(record)`,
  ));
}

export function mutateUnexpectedDelete(repoPath) {
  patchFile(path.join(repoPath, "backend/app/main.py"), (src) => `${src.trimEnd()}


@app.delete("/api/purchase-requests/{request_id}")
def delete_request(
  request_id: str,
  user: dict[str, str] = Depends(current_user),
  db: Session = Depends(get_db),
) -> dict:
  _ = user
  record = db.get(PurchaseRequest, request_id)
  if record is None:
    raise HTTPException(status_code=404, detail="not found")
  db.delete(record)
  db.commit()
  return {"deleted": True}
`);
}

export function mutateCoveragePoison(repoPath) {
  patchFile(path.join(repoPath, "backend/app/main.py"), (src) => src.replace(
    "  record.state = \"approved\"\n  create_purchase_order(db, record)\n  write_audit(db, request_id, \"approved\", user[\"id\"])\n",
    "  record.state = \"approved\"\n  mystery_side_effect(record)\n  create_purchase_order(db, record)\n  write_audit(db, request_id, \"approved\", user[\"id\"])\n",
  ));
}

export function mutatePureRefactor(repoPath) {
  const from = path.join(repoPath, "backend/app/decisions.py");
  const helpersDir = path.join(repoPath, "backend/app/helpers");
  fs.mkdirSync(helpersDir, { recursive: true });
  fs.writeFileSync(path.join(helpersDir, "__init__.py"), "");
  const dest = path.join(helpersDir, "decisions.py");
  fs.renameSync(from, dest);
  patchFile(dest, (src) => src
    .replace("from .db import Base\n", "from ..db import Base\n")
    .replace(
      "from .models import AuditEntry, PurchaseOrder, PurchaseRequest",
      "from ..models import AuditEntry, PurchaseOrder, PurchaseRequest",
    ));
  patchFile(path.join(repoPath, "backend/app/main.py"), (src) => src.replace(
    "from .decisions import create_purchase_order, list_audit_entries, new_request_id, write_audit",
    "from .helpers.decisions import create_purchase_order, list_audit_entries, new_request_id, write_audit",
  ));
}

export function raiseManagerThreshold(repoPath, nextLimit = 20000) {
  const seedPath = path.join(repoPath, "varai.seed.json");
  const seed = readJson(seedPath);
  const ctx = seed.context.find((item) => item.id === "context.manager-limit");
  if (!ctx) throw new Error("missing context.manager-limit");
  ctx.text = ctx.text.replace(/\b10000\b/, String(nextLimit));
  // Keep scenarios expressive: amount still above/below the new limit.
  writeJson(seedPath, { ...seed, ratification: { status: "draft" } });
  patchFile(path.join(repoPath, "backend/app/auth.py"), (src) => src.replace(
    'MANAGER_LIMIT = float(os.environ.get("PURCHASE_MANAGER_LIMIT", "10000"))',
    `MANAGER_LIMIT = float(os.environ.get("PURCHASE_MANAGER_LIMIT", "${nextLimit}"))`,
  ));
}
