import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../../src/server/index.js";
import { ratifySeed } from "../../src/seed/store.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

const fixtureCli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/fake-builder/cli.js",
);

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "varai-builder-server-"));
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
  ratifySeed(root, slotkeeperDraft(), { ratifiedAt: "2026-07-28T00:00:00.000Z" });
  return root;
}

async function start(repo) {
  const server = await startServer({
    repoPath: repo,
    port: 0,
    open: false,
    scanOptions: { jobs: 1, cache: false },
    analyze: async () => ({
      scan: { summary: null, model: { coverage: [], elements: [], claims: [] } },
      git: { head: "x", clean: true, semanticStoreRoot: repo },
      scannedTreeHash: "a",
      implementationTreeHash: "b",
      scanConfigHash: "c",
    }),
  });
  return {
    server,
    api: (pathname, init) => fetch(`${server.url}${pathname}`, init),
    post: (pathname, body, headers = {}) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  };
}

test("GET /api/build recovers mid-build status without inventing a running process", async (t) => {
  const repo = tempRepo();
  const { runBuildBegin } = await import("../../src/build-session/commands.js");
  const { createBuildSessionStore } = await import("../../src/build-session/store.js");
  const { BUILD_STATES } = await import("../../src/build-session/state.js");
  const started = await runBuildBegin({ repo, json: true, quiet: true, cache: false });
  const store = createBuildSessionStore(repo);
  const session = await store.getSession(started.session.id);
  session.lifecycleState = BUILD_STATES.BUILDING;
  session.builder = { adapterId: "fake", running: true, orphaned: false };
  await store.putSession(session);

  const { server, api } = await start(repo);
  t.after(() => server.close());

  const response = await api("/api/build");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.active.id, session.id);
  assert.equal(body.live.running, false);
  assert.equal(body.active.builder.running, false);
  assert.equal(body.active.builder.orphaned, true);
});

test("POST /api/build/run rejects executable payloads from the browser", async (t) => {
  const repo = tempRepo();
  const { server, post } = await start(repo);
  t.after(() => server.close());

  const response = await post("/api/build/run", {
    adapter: "fake",
    executable: "/bin/evil",
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /executable/i);
});

test("POST /api/build/run with configured adapter completes verification", async (t) => {
  const repo = tempRepo();
  const { server, post, api } = await start(repo);
  t.after(() => server.close());

  const response = await post("/api/build/run", { adapter: "fake" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.session.completedAt);
  assert.ok(body.session.gate);

  const logs = await (await api(`/api/build/logs?session=${encodeURIComponent(body.session.id)}`)).json();
  assert.ok(Array.isArray(logs.events));
});

test("POST /api/build/message never accepts a shell/executable and requires a live process", async (t) => {
  const repo = tempRepo();
  const { server, post } = await start(repo);
  t.after(() => server.close());

  const evil = await post("/api/build/message", { message: "hi", executable: "/bin/sh" });
  assert.equal(evil.status, 400);

  const noLive = await post("/api/build/message", { message: "please clarify roles" });
  assert.equal(noLive.status, 409);
});
