// Gate 2 adversarial trial — evidence semantics leap (plan §5 Gate 2):
// inverted authorization must be caught statically on the real POC, not only
// by scenarios. Skipped without the sibling POC.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { clonePoc, POC_ENV, pocAvailable, resolvePocPath } from "./purchase-approvals-harness.js";

Object.assign(process.env, POC_ENV);
const POC_PATH = resolvePocPath();
const POC_READY = pocAvailable(POC_PATH);
const skipReason = POC_READY ? false : `POC missing at ${POC_PATH} (set VARAI_POC_PATH or create sibling)`;

const WITHDRAW_KEY = "POST /api/purchase-requests/{request_id}/withdraw";

async function scanBackend(repo) {
  return scanRepo(repo, { jobs: 1, cache: false, include: ["backend"] }).then((scan) => scan.model);
}

test("Gate 2 trial: inverted authorization is caught statically on the POC", { skip: skipReason }, async () => {
  const repo = clonePoc("g2-invert-auth-static");
  try {
    const green = await scanBackend(repo);
    const greenWithdraw = green.elements.find((element) => element.key === WITHDRAW_KEY);
    const greenAuth = green.claims.filter((claim) =>
      claim.sourceId === greenWithdraw.id && claim.capability === "api.authorization");
    assert.ok(greenAuth.length > 0, "the green baseline carries an authorization claim on withdraw");

    // Fault: drop the auth dependency from the withdraw handler only (six
    // handlers share the same param line, so anchor on the withdraw decorator).
    const marker = path.join(repo, "backend/app/main.py");
    const content = fs.readFileSync(marker, "utf8");
    const faulted = content.replace(
      "@app.post(\"/api/purchase-requests/{request_id}/withdraw\", response_model=RequestOut)\n"
        + "def withdraw_request(\n"
        + "  request_id: str,\n"
        + "  user: dict[str, str] = Depends(current_user),\n",
      "@app.post(\"/api/purchase-requests/{request_id}/withdraw\", response_model=RequestOut)\n"
        + "def withdraw_request(\n"
        + "  request_id: str,\n",
    );
    assert.notEqual(faulted, content, "fault must change the withdraw handler signature");
    fs.writeFileSync(marker, faulted);

    const model = await scanBackend(repo);
    const withdraw = model.elements.find((element) => element.key === WITHDRAW_KEY);
    const authClaims = model.claims.filter((claim) =>
      claim.sourceId === withdraw.id && claim.capability === "api.authorization");
    assert.equal(authClaims.length, 0, "the faulted operation carries no authorization claim");
    const coverage = model.coverage.find((record) =>
      record.capability === "api.authorization" && record.scopeId === withdraw.id);
    assert.equal(coverage.state, "analyzed",
      "guard vocabulary elsewhere keeps the faulted scope analyzed, so absence is a violation, not a shrug");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
