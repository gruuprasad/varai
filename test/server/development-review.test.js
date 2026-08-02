import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../../src/server/index.js";
import { ratifySeed } from "../../src/seed/store.js";
import { slotkeeperDraft } from "../seed/fixtures.js";
import { createBuildSessionStore } from "../../src/build-session/store.js";

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "varai-development-review-"));
}

function analyze(repo) {
  return async () => ({
    scan: {
      summary: null,
      model: {
        schemaVersion: 2,
        system: { id: "demo", key: "demo", name: "Demo" },
        coverage: [], elements: [], claims: [], subsystems: [], diagnostics: [],
      },
    },
    git: { head: "head", clean: false, semanticStoreRoot: path.join(repo, ".varai", "semantic") },
    scannedTreeHash: "scanned",
    implementationTreeHash: "tree",
    scanConfigHash: "config",
  });
}

test("role review is stored as advisory session evidence without changing the gate", async (t) => {
  const repo = tempRepo();
  const { contentHash } = ratifySeed(repo, slotkeeperDraft(), { ratifiedAt: "2026-08-01T00:00:00.000Z" });
  const store = createBuildSessionStore(repo);
  const reportHash = await store.putObject({ summary: { total: 0 }, commitments: [], scenarios: { results: [] }, surfaces: {} });
  await store.putSession({
    formatVersion: 1,
    id: "build:reviewable",
    seedHash: contentHash,
    startedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-01T00:01:00.000Z",
    lifecycleState: "ready",
    gate: { state: "ready", reasons: [] },
    completion: { mode: "built", reportHash, implementationTreeHash: "tree" },
  });
  const calls = [];
  const reviewer = {
    provider: "local-command",
    model: "gpt-5.6-luna",
    async review(input) {
      calls.push(input);
      return { summary: "Looks coherent.", findings: [], recommendation: "accept" };
    },
  };
  const server = await startServer({ repoPath: repo, port: 0, open: false, roleReviewer: reviewer, analyze: analyze(repo) });
  t.after(() => server.close());

  const response = await fetch(`${server.url}/api/development/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roleId: "frontend" }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.review.authority, "advisory_only");
  assert.equal(body.review.recommendation, "accept");
  assert.equal(calls[0].roleId, "frontend");
  assert.equal(calls[0].seedHash, contentHash);
  assert.equal((await store.getSession("build:reviewable")).gate.state, "ready");
  assert.equal((await store.getSession("build:reviewable")).roleReviews.frontend, body.hash);
});
