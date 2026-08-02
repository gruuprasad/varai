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
  assert.match(html, /id="develop-role"/);
  assert.match(html, /Frontend — User-facing interaction/);
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

test("develop view renders the selected role lens over shared authorities", () => {
  const html = renderDevelop({
    seed: { assistant: { provider: "fake", model: "fake" } },
    activeRole: "verification",
    controlRoom: {
      development: {
        roles: {
          verification: {
            role: { label: "Verification", responsibility: "How approved intent will be checked" },
            intent: { concepts: 2, commitments: 1, surfaces: 1 },
            observed: { elements: 3 },
            evidence: { commitments: [], scenarios: [], surfaces: { accounted: [], missing: [] } },
          },
        },
      },
    },
  });
  assert.match(html, /Verification lens/);
  assert.match(html, /advisory projection/);
  assert.match(html, /id="develop-role"/);
});
