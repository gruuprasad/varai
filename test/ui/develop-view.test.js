import assert from "node:assert/strict";
import test from "node:test";
import { renderDevelop } from "../../src/ui/develop-view.js";

test("develop view carries one conversation through intent, builder, and verifier roles", () => {
  const html = renderDevelop({
    seed: {
      ratified: true,
      assistant: { provider: "openai-compatible", model: "demo" },
      conversation: [{ role: "user", content: "Build a booking app" }],
    },
    controlRoom: {
      phase: "ready",
      build: { session: { id: "build:1" }, live: { running: false }, adapters: ["codex"], events: [{ type: "output", text: "Implemented booking" }] },
      verification: { gate: { state: "ready" }, decisions: [] },
    },
  });
  assert.match(html, /Build a booking app/);
  assert.match(html, /Implemented booking/);
  assert.match(html, /Independent verifier/);
  assert.doesNotMatch(html, /id="develop-build"/);
  assert.match(html, /Describe the next product change/);
});

test("approved product offers one build action before the first build", () => {
  const html = renderDevelop({
    seed: { ratified: true, assistant: { provider: "fake", model: "fake" } },
    controlRoom: { phase: "approved", build: { session: null, live: { running: false }, adapters: ["codex"], events: [] } },
  });
  assert.match(html, /Build application/);
});

test("develop view routes a pending draft to explicit review", () => {
  const html = renderDevelop({ seed: { draft: { draft: {} } }, controlRoom: { phase: "draft", build: {} } });
  assert.match(html, /Review and approve draft/);
  assert.doesNotMatch(html, /id="develop-build"/);
});
