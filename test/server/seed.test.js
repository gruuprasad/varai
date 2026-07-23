import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../../src/server/index.js";
import { createFakeAssistant } from "../../src/seed/assistant.js";
import { canonicalStringifySeed, canonicalizeSeed } from "../../src/seed/canonicalize.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { SEED_FILE } from "../../src/seed/schema.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "varai-seed-studio-"));
}

async function startStudio(repo, { assistant } = {}) {
  const server = await startServer({ repoPath: repo, port: 0, open: false, seedAssistant: assistant ?? null, scanOptions: { jobs: 1, cache: false } });
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

test("a fake assistant proposal becomes a validated draft; a malicious one cannot bypass validation", async (t) => {
  const repo = tempRepo();
  const assistant = createFakeAssistant(() => ({ draft: slotkeeperDraft(), questions: [], unsupported: ["Booking must be atomic"] }));
  const { server, api, post } = await startStudio(repo, { assistant });
  t.after(() => server.close());

  const response = await post("/api/seed/draft", { message: "members book slots" });
  assert.equal(response.status, 200);
  const draft = await response.json();
  assert.equal(draft.draft.system.id, "slotkeeper");
  assert.deepEqual(draft.problems, []);
  assert.deepEqual(draft.unsupported, ["Booking must be atomic"]);
  assert.equal(assistant.calls.length, 1, "the call happened exactly once, from the explicit POST");
  assert.ok(!fs.existsSync(path.join(repo, SEED_FILE)), "draft never writes the seed file");

  const maliciousDraft = {
    ...slotkeeperDraft(),
    commitments: [{ id: "commitment.x", source: "behavior.book-slot", relation: "forbids", target: { literal: "y" } }],
  };
  const evil = await startStudio(repo, {
    assistant: createFakeAssistant(() => ({ draft: maliciousDraft })),
  });
  t.after(() => evil.server.close());
  const bad = await (await evil.post("/api/seed/draft", { message: "sneaky" })).json();
  assert.ok(bad.problems.some((problem) => problem.code === "unknown-relation"));
  assert.ok(!fs.existsSync(path.join(repo, SEED_FILE)), "an invalid proposal still cannot write the seed");
});

test("assistant receives only conversation and current seed — never repository code", async (t) => {
  const repo = tempRepo();
  fs.writeFileSync(path.join(repo, "secret.py"), "API_TOKEN = 'hunter2'\n", "utf8");
  const assistant = createFakeAssistant(() => ({ draft: null, questions: ["q"], unsupported: [] }));
  const { server, post } = await startStudio(repo, { assistant });
  t.after(() => server.close());

  await post("/api/seed/draft", { message: "describe slotkeeper" });
  const sent = JSON.stringify(assistant.calls);
  assert.ok(sent.includes("describe slotkeeper"));
  assert.ok(!sent.includes("hunter2"), "repository file content never reaches the assistant");
});

test("no assistant call happens without an explicit POST", async (t) => {
  const repo = tempRepo();
  const assistant = createFakeAssistant();
  const { server, api } = await startStudio(repo, { assistant });
  t.after(() => server.close());

  await api("/api/seed");
  await api("/api/reconciliation");
  assert.equal(assistant.calls.length, 0, "GET endpoints never call the assistant");
  const status = await (await api("/api/seed")).json();
  assert.deepEqual(status.assistant, { provider: "fake", model: "deterministic-fake" }, "browser sees destination, never credentials");
});

test("ratify writes exactly the reviewed canonical draft", async (t) => {
  const repo = tempRepo();
  const reviewed = slotkeeperDraft();
  const { server, post } = await startStudio(repo);
  t.after(() => server.close());

  const premature = await post("/api/seed/ratify", { draft: reviewed });
  assert.equal(premature.status, 409, "ratify requires a draft under review first");

  await post("/api/seed/draft", { proposal: { draft: reviewed, questions: [], unsupported: [] } });
  const tampered = { ...reviewed, system: { id: "other", name: "Other" } };
  const conflict = await post("/api/seed/ratify", { draft: tampered });
  assert.equal(conflict.status, 409, "ratify rejects a draft different from the one under review");

  const response = await post("/api/seed/ratify", { draft: reviewed });
  assert.equal(response.status, 200);
  const { contentHash } = await response.json();
  assert.equal(contentHash, seedContentHash(reviewed));

  const written = fs.readFileSync(path.join(repo, SEED_FILE), "utf8");
  const expected = canonicalStringifySeed(canonicalizeSeed({
    ...reviewed,
    ratification: { status: "ratified", contentHash, ratifiedAt: JSON.parse(written).ratification.ratifiedAt },
  }));
  assert.equal(written, expected, "the file is exactly the reviewed draft, canonicalized, plus ratification");
  assert.ok(!fs.readdirSync(repo).some((name) => name.endsWith(".tmp")), "no temp file is left behind");
});

test("mutation endpoints reject invalid origin and oversized bodies", async (t) => {
  const repo = tempRepo();
  const { server, post } = await startStudio(repo);
  t.after(() => server.close());

  const badOrigin = await post("/api/seed/draft", { proposal: { draft: null } }, { Origin: "https://evil.example" });
  assert.equal(badOrigin.status, 403);

  const goodOrigin = await post("/api/seed/draft", { proposal: { draft: null } }, { Origin: server.url });
  assert.notEqual(goodOrigin.status, 403, "the dashboard's own origin is accepted");

  const oversized = await fetch(`${server.url}/api/seed/ratify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: { padding: "x".repeat(300 * 1024) } }),
  });
  assert.equal(oversized.status, 413);
});

test("a crafted draft cannot smuggle a path escape through ratification", async (t) => {
  const repo = tempRepo();
  const { server, post } = await startStudio(repo);
  t.after(() => server.close());

  const escaped = { ...slotkeeperDraft(), system: { id: "../../etc/passwd", name: "Escape" } };
  await post("/api/seed/draft", { proposal: { draft: escaped } });
  const response = await post("/api/seed/ratify", { draft: escaped });
  assert.equal(response.status, 422);
  assert.ok(!fs.existsSync(path.join(repo, SEED_FILE)));
});

test("reconciliation endpoint reports the fixture seed against the scanned model", async (t) => {
  const fixture = path.resolve("test/fixtures/semantic-assembly-structural");
  const { server, api } = await startStudio(fixture);
  t.after(() => server.close());

  const deadline = Date.now() + 20000;
  let data;
  do {
    data = await (await api("/api/reconciliation")).json();
    if (data.report) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);

  assert.ok(data.report, "reconciliation report is produced");
  assert.equal(data.report.summary.holds, 5);
  assert.equal(data.report.summary.violated, 0);
});
