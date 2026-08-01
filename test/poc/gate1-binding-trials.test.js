// Gate 1 adversarial trials — Binding UX leap (plan §5 Gate 1, task 6):
// wrong-selector realization, stale carry-forward, and rebinding to a
// still-present old element. Skipped without the sibling POC; each trial
// clones the green baseline so the implementation never becomes a fixture.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runBuildBegin, runBuildClose, runBuildStatus } from "../../src/build-session/commands.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { clonePoc, POC_ENV, pocAvailable, resolvePocPath } from "./purchase-approvals-harness.js";

Object.assign(process.env, POC_ENV);
const POC_PATH = resolvePocPath();
const POC_READY = pocAvailable(POC_PATH);
const skipReason = POC_READY ? false : `POC missing at ${POC_PATH} (set VARAI_POC_PATH or create sibling)`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = path.join(root, "bin/varai.js");

function lintCli(repo, witnessPath) {
  try {
    const out = execFileSync(
      process.execPath,
      [bin, "realization", "lint", witnessPath, repo, "--no-cache"],
      { encoding: "utf8", env: { ...process.env } },
    );
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: err.stdout ?? "" };
  }
}

async function greenBaseline(repo) {
  await runBuildBegin({ repo, json: true, cache: false, jobs: 1, quiet: true });
  const closed = await runBuildClose({ repo, mode: "built", json: true, cache: false, jobs: 1, quiet: true });
  assert.equal(closed.session.gate?.state, GATE_STATES.READY, "trial baseline must be green");
  return closed;
}

test("Gate 1 trial A: wrong selector is caught in one lint iteration on the real POC", { skip: skipReason }, async () => {
  const repo = clonePoc("g1-wrong-selector");
  try {
    const witnessPath = path.join(repo, "varai.realization.json");
    const witness = JSON.parse(fs.readFileSync(witnessPath, "utf8"));
    witness.bindings = witness.bindings.map((binding) =>
      binding.id === "binding.submit"
        ? { ...binding, artifact: { lens: "api", kind: "operation", key: "POST /api/orders" } }
        : binding);
    fs.writeFileSync(witnessPath, JSON.stringify(witness, null, 2));

    const first = lintCli(repo, witnessPath);
    assert.equal(first.code, 1, "a wrong selector must fail lint");
    assert.ok(first.out.includes("not-found"), first.out);
    assert.ok(first.out.includes("candidates (ranked, never chosen)"), first.out);
    const fixed = { ...witness, bindings: witness.bindings.map((binding) =>
      binding.id === "binding.submit"
        ? { ...binding, artifact: { lens: "api", kind: "operation", key: "POST /api/purchase-requests" } }
        : binding) };
    fs.writeFileSync(witnessPath, JSON.stringify(fixed, null, 2));
    const second = lintCli(repo, witnessPath);
    assert.equal(second.code, 0, "fixing the selector from lint output must pass in one iteration");
    assert.ok(second.out.includes("Actionable: every binding resolves"), second.out);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("Gate 1 trial B: stale carry-forward is caught by lint after a product change", { skip: skipReason }, async () => {
  const repo = clonePoc("g1-stale-carry-forward");
  try {
    await greenBaseline(repo);
    const witnessPath = path.join(repo, "varai.realization.json");

    // Product change: raise the manager threshold (context change only).
    const { raiseManagerThreshold, syncSeedHash } = await import("./purchase-approvals-harness.js");
    raiseManagerThreshold(repo, 20000);
    const draft = JSON.parse(fs.readFileSync(path.join(repo, "varai.seed.json"), "utf8"));
    const { ratifySeed } = await import("../../src/seed/store.js");
    ratifySeed(repo, draft, { ratifiedAt: "2026-08-01T00:00:00.000Z" });
    syncSeedHash(repo);

    const handoffOut = execFileSync(process.execPath, [bin, "handoff", repo, "--json"], {
      encoding: "utf8",
      env: { ...process.env },
    });
    const packet = JSON.parse(handoffOut);
    assert.equal(packet.baseline.present, true, "a prior ready session is the baseline");
    assert.ok(packet.changes?.context?.changed?.length > 0, "the product change appears in changes");
    assert.ok(packet.carryForwardCandidates.bindings.length > 0, "unchanged mappings are carry-forward candidates");

    // The builder blindly carries a candidate whose target element is gone.
    const carried = {
      ...packet.carryForwardCandidates.bindings[0],
      artifact: { lens: "api", kind: "operation", key: "GET /api/nonexistent" },
    };
    const witness = JSON.parse(fs.readFileSync(witnessPath, "utf8"));
    witness.bindings = witness.bindings.map((binding) => (binding.id === carried.id ? carried : binding));
    fs.writeFileSync(witnessPath, JSON.stringify(witness, null, 2));
    const lint = lintCli(repo, witnessPath);
    assert.equal(lint.code, 1, "a stale carried binding must fail lint");
    assert.ok(lint.out.includes("not-found"), lint.out);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("Gate 1 trial C: rebinding to a still-present old element reports rebound", { skip: skipReason }, async () => {
  const repo = clonePoc("g1-rebound");
  try {
    await greenBaseline(repo);
    const witnessPath = path.join(repo, "varai.realization.json");
    const witness = JSON.parse(fs.readFileSync(witnessPath, "utf8"));
    // Re-point get-request at a different still-present operation element and
    // drop the concept that used to claim it (health-check), so this is a
    // genuine rebind rather than a concept collision.
    witness.bindings = witness.bindings
      .filter((binding) => binding.id !== "binding.health")
      .map((binding) =>
        binding.id === "binding.get"
          ? { ...binding, artifact: { lens: "api", kind: "operation", key: "GET /health" } }
          : binding);
    fs.writeFileSync(witnessPath, JSON.stringify(witness, null, 2));

    const status = await runBuildStatus({ repo, json: true, quiet: true, cache: false, jobs: 1 });
    assert.equal(status.continuity.present, true, "a prior ready session exists");
    const rebound = status.continuity.entries.find((entry) => entry.id === "binding.get");
    assert.ok(rebound, `binding.get must appear in continuity, got ${JSON.stringify(status.continuity.entries.map((e) => e.id))}`);
    assert.equal(rebound.state, "rebound");
    assert.ok(
      rebound.oldElementFates.some((item) => item.fate === "still-present"),
      `old element must be reported still-present, got ${JSON.stringify(rebound.oldElementFates)}`,
    );
    assert.ok(status.continuity.summary.rebound >= 1);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

