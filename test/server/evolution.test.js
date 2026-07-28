import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBuildSessionStore } from "../../src/build-session/store.js";
import { startServer } from "../../src/server/index.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

test("progression endpoint is read-only and returns the latest completed session pair", async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "varai-evolution-server-"));
  const store = createBuildSessionStore(repo);
  const seedHash = await store.putObject(slotkeeperDraft());
  const reportHash = await store.putObject({ commitments: [] });
  await store.putSession({ id: "build:older", seedObjectHash: seedHash, completedAt: "2026-01-01T00:00:00.000Z", completion: { mode: "built", reportHash } });
  await store.putSession({ id: "build:newer", seedObjectHash: seedHash, completedAt: "2026-01-02T00:00:00.000Z", completion: { mode: "carry-forward", reportHash } });
  const server = await startServer({ repoPath: repo, port: 0, open: false, scanOptions: { jobs: 1, cache: false } });
  t.after(() => server.close());
  const response = await fetch(`${server.url}/api/progression`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.progression.from.id, "build:older");
  assert.equal(body.progression.to.id, "build:newer");
  assert.equal(body.sessions.length, 2);
});
