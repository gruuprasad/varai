import assert from "node:assert/strict";
import test from "node:test";
import { renderBuild } from "../../src/ui/build-view.js";

test("empty build view shows no active session", () => {
  const html = renderBuild({ session: null, live: { running: false }, events: [], adapters: ["fake"] });
  assert.match(html, /No active build|approved Seed/i);
  assert.match(html, /Start build|fake/);
});

test("building state shows immutable seed fingerprint, status, files, logs, interventions", () => {
  const html = renderBuild({
    session: {
      id: "build:abc",
      seedHash: "sha256:deadbeefcafebabe",
      lifecycleState: "building",
      builder: { adapterId: "fake", running: true },
      interventions: [{ path: "app.py", at: "2026-07-28T00:00:00.000Z" }],
      previewUrl: "http://127.0.0.1:5173",
      changedFiles: ["app.py", "routes.py"],
    },
    live: { running: true },
    events: [
      { type: "log", stream: "stdout", text: "builder started", at: "2026-07-28T00:00:01.000Z" },
      { type: "message", text: "clarify roles", role: "user", at: "2026-07-28T00:00:02.000Z" },
    ],
    adapters: ["fake"],
  });
  assert.match(html, /deadbeefcafe/);
  assert.match(html, /building/i);
  assert.match(html, /app\.py/);
  assert.match(html, /builder started/);
  assert.match(html, /clarify roles/);
  assert.match(html, /intervention/i);
  assert.match(html, /127\.0\.0\.1:5173/);
  assert.doesNotMatch(html, /contenteditable|intent-ratify|Approve this draft/i);
});

test("build view never offers semantic Seed editing controls", () => {
  const html = renderBuild({
    session: { id: "build:1", seedHash: "sha256:abc", lifecycleState: "ready", builder: null, interventions: [], changedFiles: [] },
    live: { running: false },
    events: [],
    adapters: [],
  });
  assert.doesNotMatch(html, /id="intent-message"|id="intent-proposal"|Approve this draft/);
});
