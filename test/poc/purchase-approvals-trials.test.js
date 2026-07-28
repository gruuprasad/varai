import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { runBuildBegin, runBuildClose, runBuildStatus } from "../../src/build-session/commands.js";
import { GATE_STATES } from "../../src/build-session/state.js";
import { recordBuildIntervention } from "../../src/builder/commands.js";
import { projectProgression } from "../../src/evolution/project.js";
import { projectBlueprint } from "../../src/product-blueprint/project.js";
import { ratifySeed, readSeed } from "../../src/seed/store.js";
import {
  POC_ENV,
  clonePoc,
  mutateCorruptDeny,
  mutateCoveragePoison,
  mutateInvertAuth,
  mutateOmitAudit,
  mutatePureRefactor,
  mutateUnexpectedDelete,
  raiseManagerThreshold,
  syncSeedHash,
} from "./purchase-approvals-harness.js";

// build close → verify scenarios inherits process.env (no per-call env override).
Object.assign(process.env, POC_ENV);

async function closeBuilt(repo) {
  return runBuildClose({
    repo,
    mode: "built",
    json: true,
    cache: false,
    jobs: 1,
    quiet: true,
  });
}

async function begin(repo) {
  return runBuildBegin({ repo, json: true, cache: false, jobs: 1, quiet: true });
}

function assertGate(session, expected, label) {
  assert.equal(session.gate?.state, expected, `${label}: gate=${session.gate?.state} reasons=${JSON.stringify(session.gate?.reasons)}`);
}

test("trial 1 green build → ready", async () => {
  const repo = clonePoc("green");
  try {
    await begin(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.READY, "green");
    assert.equal(closed.session.gate.scenarioProblems.length, 0);
    assert.equal(closed.session.gate.surfaceProblems.unaccounted, 0);
    assert.equal(closed.report.summary.surfaces.unaccounted, 0);
    assert.equal(closed.report.summary.scenarios.failed, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 2 omitted audit → not ready", async () => {
  const repo = clonePoc("omit-audit");
  try {
    mutateOmitAudit(repo);
    await begin(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.NEEDS_ATTENTION, "omit-audit");
    assert.ok(
      closed.session.gate.scenarioProblems.some((item) => item.result === "failed"),
      `expected failed scenarios, got ${JSON.stringify(closed.session.gate.scenarioProblems)}`,
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 3 inverted authorization → scenario fails → not ready", async () => {
  const repo = clonePoc("invert-auth");
  try {
    mutateInvertAuth(repo);
    await begin(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.NEEDS_ATTENTION, "invert-auth");
    assert.ok(
      closed.session.gate.scenarioProblems.some((item) =>
        item.id === "scenario.non-owner-cannot-withdraw" && item.result === "failed"),
      JSON.stringify(closed.session.gate.scenarioProblems),
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 4 state corruption after denial → follow-up fails → not ready", async () => {
  const repo = clonePoc("corrupt-deny");
  try {
    mutateCorruptDeny(repo);
    await begin(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.NEEDS_ATTENTION, "corrupt-deny");
    assert.ok(
      closed.session.gate.scenarioProblems.some((item) =>
        item.id === "scenario.non-owner-cannot-withdraw" && item.result === "failed"),
      JSON.stringify(closed.session.gate.scenarioProblems),
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 5 unexpected DELETE → unaccounted surface → not ready", async () => {
  const repo = clonePoc("unexpected-delete");
  try {
    mutateUnexpectedDelete(repo);
    await begin(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.NEEDS_ATTENTION, "unexpected-delete");
    assert.ok(closed.session.gate.surfaceProblems.unaccounted > 0, "expected unaccounted surface");
    assert.ok(
      closed.session.gate.reasons.some((reason) => reason.startsWith("unaccounted-surface:")),
      JSON.stringify(closed.session.gate.reasons),
    );
    // Positive scenarios may still hold — readiness still blocked by surface accounting.
    assert.ok((closed.report.summary.scenarios?.failed ?? 0) === 0
      || closed.session.gate.surfaceProblems.unaccounted > 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 6 coverage poisoning → coverage regression → not ready", async () => {
  const repo = clonePoc("coverage-poison");
  try {
    await begin(repo);
    mutateCoveragePoison(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.NEEDS_ATTENTION, "coverage-poison");
    assert.ok(
      closed.session.gate.coverageRegressions.some((item) => item.transition === "degraded"),
      JSON.stringify(closed.session.gate.coverageRegressions),
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 7 pure refactor → still ready / no product-rule regression", async () => {
  const repo = clonePoc("pure-refactor");
  try {
    await begin(repo);
    mutatePureRefactor(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.READY, "pure-refactor");
    assert.equal(closed.session.gate.requirementRegressions.length, 0);
    assert.equal(closed.session.gate.scenarioProblems.length, 0);
    assert.equal(closed.session.gate.surfaceProblems.unaccounted, 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 8 product change (raise threshold) → progression exists", async () => {
  const repo = clonePoc("product-change");
  try {
    await begin(repo);
    const closed1 = await closeBuilt(repo);
    assertGate(closed1.session, GATE_STATES.READY, "product-change-before");
    const seedBefore = readSeed(repo).seed;
    const blueprintBefore = projectBlueprint({ seed: seedBefore, report: closed1.report });

    raiseManagerThreshold(repo, 20000);
    const draft = readJsonSeed(repo);
    ratifySeed(repo, draft, { ratifiedAt: "2026-07-28T12:00:00.000Z" });
    syncSeedHash(repo);

    await begin(repo);
    const closed2 = await closeBuilt(repo);
    assertGate(closed2.session, GATE_STATES.READY, "product-change-after");
    const seedAfter = readSeed(repo).seed;
    const blueprintAfter = projectBlueprint({ seed: seedAfter, report: closed2.report });
    assert.ok(blueprintBefore && blueprintAfter, "blueprint projects before and after Change");

    const progression = await projectProgression(repo, {
      from: closed1.session.id,
      to: closed2.session.id,
    });
    assert.notEqual(progression.from.id, progression.to.id);
    assert.ok(
      (progression.seedDiff?.context?.changed?.length ?? 0) > 0,
      `expected context seedDiff, got ${JSON.stringify(progression.seedDiff?.context)}`,
    );
    assert.ok(
      JSON.stringify(progression.seedDiff).includes("20000"),
      "expected raised threshold in seedDiff",
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("trial 9 outside-session edit → provenance unattested", async () => {
  const repo = clonePoc("outside-edit");
  try {
    await begin(repo);
    const closed = await closeBuilt(repo);
    assertGate(closed.session, GATE_STATES.READY, "outside-edit-before");

    const marker = path.join(repo, "backend/app/main.py");
    fs.appendFileSync(marker, "\n# outside-session edit\n");
    await recordBuildIntervention(repo, { path: "backend/app/main.py", reason: "manual_edit" });

    const status = await runBuildStatus({ repo, json: true, quiet: true });
    assert.equal(status.provenanceHint?.state, "unattested");
    assert.equal(status.provenanceHint?.sessionId, closed.session.id);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

function readJsonSeed(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repoPath, "varai.seed.json"), "utf8"));
}
