import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../../src/server/index.js";
import { ratifySeed } from "../../src/seed/store.js";
import { writeAuthoringSession } from "../../src/seed/authoring-session.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { diffSeeds } from "../../src/seed/diff.js";

const fixtureCli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/fake-builder/cli.js",
);

function v3Seed() {
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
      { id: "surface.submit-api", name: "Submit API", behavior: "behavior.submit", channel: "api", access: "authenticated" },
    ],
    scenarios: [],
    context: [],
  };
}

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "varai-control-room-"));
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
  ratifySeed(root, v3Seed(), { ratifiedAt: "2026-07-28T00:00:00.000Z" });
  return root;
}

function stubAnalyze(repo) {
  return async () => ({
    scan: {
      summary: null,
      model: {
        schemaVersion: 2,
        system: { id: "demo", key: "demo", name: "Demo" },
        coverage: [],
        elements: [],
        claims: [],
        subsystems: [],
        diagnostics: [],
      },
    },
    git: { head: "x", clean: false, semanticStoreRoot: path.join(repo, ".varai", "semantic") },
    scannedTreeHash: "a",
    implementationTreeHash: "b",
    scanConfigHash: "c",
  });
}

async function start(repo, { assistant = null } = {}) {
  const server = await startServer({
    repoPath: repo,
    port: 0,
    open: false,
    seedAssistant: assistant,
    scanOptions: { jobs: 1, cache: false },
    analyze: stubAnalyze(repo),
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

test("GET /api/control-room aggregates blueprint, build, and verification projections", async (t) => {
  const repo = tempRepo();
  const { server, api } = await start(repo);
  t.after(() => server.close());

  const response = await api("/api/control-room");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.blueprint.empty, false);
  assert.ok(body.blueprint.actors.some((a) => a.id === "actor.employee"));
  assert.ok(body.build);
  assert.ok(body.verification);
  assert.ok(["draft", "approved", "building", "verifying", "ready", "needs_attention", "build_failed", "superseded", "unattested", "empty"].includes(body.phase));
});

test("control-room change section exposes unresolved queue and blocks approval while unresolved", async (t) => {
  const repo = tempRepo();
  const approved = JSON.parse(fs.readFileSync(path.join(repo, "varai.seed.json"), "utf8"));
  const draft = {
    ...v3Seed(),
    context: [...v3Seed().context, { id: "context.note", text: "extra" }],
  };
  writeAuthoringSession(repo, {
    baseSeedHash: seedContentHash(approved),
    conversation: [],
    review: {
      draft,
      questions: ["Who may withdraw?"],
      unsupported: ["Must be atomic"],
      problems: [],
      diff: diffSeeds(approved, draft),
      contentHash: seedContentHash(draft),
      source: "assistant",
    },
  });

  const { server, api } = await start(repo);
  t.after(() => server.close());

  const body = await (await api("/api/control-room")).json();
  assert.equal(body.change.unresolved.length, 2);
  assert.equal(body.change.approvalAllowed, false);
  assert.match(body.change.approvalBlockedReason, /unresolved/i);
});

test("seed with model and no prior build does not invent an unattested regression decision", async (t) => {
  const repo = tempRepo();
  const { server, api } = await start(repo);
  t.after(() => server.close());

  const body = await (await api("/api/control-room")).json();
  assert.ok(!body.verification.decisions.some((d) => d.kind === "unattested"),
    `unexpected unattested decisions: ${JSON.stringify(body.verification.decisions)}`);
  assert.doesNotMatch(JSON.stringify(body.verification), /Repository changed after ready/);
});

test("removing an unresolved item records an auditable draft context note and diff", async (t) => {
  const repo = tempRepo();
  const approved = JSON.parse(fs.readFileSync(path.join(repo, "varai.seed.json"), "utf8"));
  const draft = { ...v3Seed(), context: [] };
  writeAuthoringSession(repo, {
    baseSeedHash: seedContentHash(approved),
    conversation: [],
    review: {
      draft,
      questions: ["Who may withdraw?"],
      unsupported: [],
      problems: [],
      diff: diffSeeds(approved, draft),
      contentHash: seedContentHash(draft),
      source: "assistant",
    },
  });
  const { server, post } = await start(repo);
  t.after(() => server.close());

  const response = await post("/api/seed/draft/resolve", {
    action: "remove",
    kind: "question",
    index: 0,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.questions.length, 0);
  assert.ok(body.draft.context.some((entry) => /removed unresolved|Who may withdraw/i.test(entry.text)));
  assert.ok(body.diff.context.added.some((entry) => /removed|withdraw/i.test(entry.id + entry.text)));
});
