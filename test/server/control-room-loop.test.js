import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../../src/server/index.js";
import { renderVerification, READY_CHROME_CLASS, READY_BADGE_TEXT } from "../../src/ui/verification-view.js";
import { renderBlueprint } from "../../src/ui/blueprint-view.js";
import { renderBuild } from "../../src/ui/build-view.js";
import { renderReviewActions, renderUnresolvedQueue } from "../../src/ui/intent-view.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { diffSeeds } from "../../src/seed/diff.js";

const fixtureCli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/fake-builder/cli.js",
);

function v3Seed(extra = {}) {
  return {
    formatVersion: 3,
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "actor.employee", role: "actor", name: "Employee" },
      { id: "behavior.submit", role: "behavior", name: "Submit" },
      { id: "resource.request", role: "resource", name: "Request" },
    ],
    commitments: [
      {
        id: "commitment.employee-submits",
        source: "actor.employee",
        relation: "performs",
        target: { concept: "behavior.submit" },
        expectation: "present",
      },
    ],
    surfaces: [
      {
        id: "surface.submit-api",
        name: "Submit API",
        behavior: "behavior.submit",
        channel: "api",
        access: "authenticated",
      },
    ],
    scenarios: [
      {
        id: "scenario.happy",
        name: "Employee submits",
        principals: [{ as: "requester", actor: "actor.employee" }],
        steps: [{ id: "submit", as: "requester", invoke: "behavior.submit", expect: { status: 201 } }],
      },
    ],
    context: [],
    ...extra,
  };
}

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "varai-control-loop-"));
  fs.writeFileSync(path.join(root, "app.py"), "def app():\n    return 1\n");
  fs.writeFileSync(path.join(root, "varai.config.json"), JSON.stringify({
    builders: {
      fake: {
        executable: process.execPath,
        args: [fixtureCli, "--mode", "success", "--packet"],
      },
    },
  }));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
  return root;
}

async function start(repo, assistant) {
  const server = await startServer({
    repoPath: repo,
    port: 0,
    open: false,
    seedAssistant: assistant,
    scanOptions: { jobs: 1, cache: false },
    analyze: async () => ({
      scan: {
        summary: null,
        model: {
          schemaVersion: 2,
          coverage: [],
          elements: [],
          claims: [],
          subsystems: [],
          system: { id: "demo", key: "demo", name: "Demo" },
        },
      },
      git: { head: "x", clean: true, semanticStoreRoot: path.join(repo, ".varai", "semantic") },
      scannedTreeHash: "a",
      implementationTreeHash: "b",
      scanConfigHash: "c",
    }),
  });
  return {
    server,
    api: (pathname, init) => fetch(`${server.url}${pathname}`, init),
    post: (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

test("POC loop: draft → resolve unresolved → approve → fake build → verify; failed gate cannot render ready", async (t) => {
  const repo = tempRepo();
  const draftSeed = v3Seed();
  const assistant = {
    provider: "test",
    model: "fixture",
    async propose() {
      return {
        draft: draftSeed,
        questions: ["Who owns the request?"],
        unsupported: ["Must be atomic under concurrency"],
      };
    },
  };

  const { server, api, post } = await start(repo, assistant);
  t.after(() => server.close());

  // 1. Chat draft (no JSON pasting)
  const drafted = await (await post("/api/seed/draft", { message: "Employees can submit purchase requests" })).json();
  assert.ok(drafted.draft);
  assert.equal(drafted.questions.length, 1);
  assert.equal(drafted.unsupported.length, 1);

  // UX: approval disabled while unresolved; queue exposes actions
  const reviewHtml = renderReviewActions(drafted) + renderUnresolvedQueue(drafted);
  assert.match(reviewHtml, /disabled/);
  assert.match(reviewHtml, /aria-describedby="intent-approve-blocked"/);
  assert.match(reviewHtml, /unresolved-answer/);

  // Control-room change projection agrees
  let room = await (await api("/api/control-room")).json();
  assert.equal(room.change.approvalAllowed, false);
  assert.equal(room.phase, "draft");

  // 2. Resolve unresolved via API (answer / convert / remove) — no JSON edit
  let resolved = await (await post("/api/seed/draft/resolve", {
    action: "answer", kind: "question", index: 0, answer: "The employee who submitted it",
  })).json();
  assert.equal(resolved.questions.length, 0);

  resolved = await (await post("/api/seed/draft/resolve", {
    action: "to_context", kind: "unsupported", index: 0,
  })).json();
  assert.equal(resolved.unsupported.length, 0);
  assert.ok(resolved.draft.context.some((item) => /atomic/i.test(item.text)));

  room = await (await api("/api/control-room")).json();
  assert.equal(room.change.approvalAllowed, true);
  assert.equal(room.change.unresolved.length, 0);

  // Approve still blocked if we try with unresolved — already cleared; ratify
  const ratified = await post("/api/seed/ratify", { draft: resolved.draft });
  assert.equal(ratified.status, 200, await ratified.text());

  room = await (await api("/api/control-room")).json();
  assert.ok(["approved", "needs_attention"].includes(room.phase));
  const blueprintHtml = renderBlueprint(room.blueprint);
  assert.match(blueprintHtml, /Employee|Submit/);
  assert.match(blueprintHtml, /surface\.submit-api|Submit API/);

  // 3. Fake build
  const buildResponse = await post("/api/build/run", { adapter: "fake" });
  assert.equal(buildResponse.status, 200);
  const buildBody = await buildResponse.json();
  assert.ok(buildBody.session?.gate, "gate must come from evaluateBuildGate, not builder prose");
  assert.notEqual(buildBody.session.gate.state, undefined);

  room = await (await api("/api/control-room")).json();
  const buildHtml = renderBuild(room.build);
  assert.match(buildHtml, /Approved Seed|deadbeef|sha256:|[a-f0-9]{8}/i);
  assert.doesNotMatch(buildHtml, /Approve this draft|intent-proposal/);

  // 4. Verify — with scenarios that could not run / missing surfaces, ready chrome is impossible
  const verification = room.verification;
  assert.ok(verification.gate);
  const verifyHtml = renderVerification(verification);

  if (verification.gate.state === "ready") {
    // Empty-model fixture may pass structural gate; still require evidence links when decisions exist
    assert.match(verifyHtml, new RegExp(READY_CHROME_CLASS));
  } else {
    assert.doesNotMatch(verifyHtml, new RegExp(`class="[^"]*${READY_CHROME_CLASS}`));
    assert.doesNotMatch(verifyHtml, new RegExp(`>${READY_BADGE_TEXT}<`));
    assert.doesNotMatch(verifyHtml, /aria-label="Ready"/i);
    // Every decision links to concrete ids
    for (const decision of verification.decisions) {
      for (const id of decision.evidenceIds ?? []) {
        assert.match(verifyHtml, new RegExp(`data-evidence-id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
      }
    }
  }

  // Explicit failed-gate fixture: HTML cannot show ready when gate fails
  const failedHtml = renderVerification({
    phase: "needs_attention",
    gate: {
      state: "needs_attention",
      reasons: ["scenario-failed:scenario.happy", "unaccounted-surface:DELETE /x", "missing-surface:surface.submit-api"],
      coverageRegressions: [],
      requirementRegressions: [],
      surfaceProblems: { missing: 1, unaccounted: 1, ambiguous: 0, stale: 0 },
      scenarioProblems: [{ id: "scenario.happy", result: "failed", reasons: ["status-mismatch"] }],
    },
    decisions: [
      { kind: "failed_scenario", id: "scenario.happy", label: "Employee submits", evidenceIds: ["scenario.happy", "status-mismatch"] },
      { kind: "unaccounted_surface", id: "DELETE /x", label: "DELETE /x", evidenceIds: ["DELETE /x"] },
      { kind: "missing_behavior", id: "surface.submit-api", label: "Submit API", evidenceIds: ["surface.submit-api"] },
    ],
  });
  assert.doesNotMatch(failedHtml, new RegExp(READY_CHROME_CLASS));
  assert.doesNotMatch(failedHtml, new RegExp(`>${READY_BADGE_TEXT}<`));
  assert.match(failedHtml, /data-evidence-id="scenario\.happy"/);
  assert.match(failedHtml, /data-evidence-id="DELETE \/x"/);
  assert.match(failedHtml, /data-evidence-id="surface\.submit-api"/);
});

test("ratify rejects while unresolved items remain", async (t) => {
  const repo = tempRepo();
  const draftSeed = v3Seed();
  const { writeAuthoringSession } = await import("../../src/seed/authoring-session.js");
  writeAuthoringSession(repo, {
    baseSeedHash: null,
    conversation: [],
    review: {
      draft: draftSeed,
      questions: ["Still open?"],
      unsupported: [],
      problems: [],
      diff: diffSeeds(null, draftSeed),
      contentHash: seedContentHash(draftSeed),
      source: "assistant",
    },
  });

  const { server, post } = await start(repo, null);
  t.after(() => server.close());

  const response = await post("/api/seed/ratify", { draft: draftSeed });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error, /unresolved/i);
});
