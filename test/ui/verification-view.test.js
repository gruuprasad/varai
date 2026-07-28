import assert from "node:assert/strict";
import test from "node:test";
import { renderVerification, READY_CHROME_CLASS, READY_BADGE_TEXT } from "../../src/ui/verification-view.js";

function baseVerification(overrides = {}) {
  return {
    phase: "needs_attention",
    gate: {
      state: "needs_attention",
      reasons: [
        "missing-surface:surface.submit-ui",
        "scenario-failed:scenario.happy",
        "unaccounted-surface:DELETE /x",
        "coverage-degraded:effect:el.1",
        "requirement-regression:holds->violated:commitment.x",
      ],
      coverageRegressions: [{ capability: "effect", scopeId: "el.1", from: "analyzed", to: "partial" }],
      requirementRegressions: [{ id: "commitment.x", from: "holds", to: "violated", kind: "holds->violated" }],
      surfaceProblems: { missing: 1, unaccounted: 1, ambiguous: 0, stale: 0 },
      scenarioProblems: [{ id: "scenario.happy", result: "failed", reasons: ["status-mismatch"] }],
    },
    decisions: [
      { kind: "missing_behavior", id: "commitment.x", label: "Submit creates Request", evidenceIds: ["commitment.x"] },
      { kind: "failed_scenario", id: "scenario.happy", label: "Happy path", evidenceIds: ["scenario.happy", "status-mismatch"] },
      { kind: "unaccounted_surface", id: "DELETE /x", label: "DELETE /x", evidenceIds: ["DELETE /x"] },
      { kind: "coverage_degradation", id: "effect:el.1", label: "effect on el.1", evidenceIds: ["el.1"] },
      { kind: "stale_binding", id: "surface.stale", label: "Stale surface", evidenceIds: ["surface.stale"] },
      { kind: "unattested", id: "repo", label: "Repository changed after ready", evidenceIds: ["provenance"] },
    ],
    ...overrides,
  };
}

test("needs_attention leads with decisions and cannot render ready chrome", () => {
  const html = renderVerification(baseVerification());
  assert.match(html, /Missing behavior|missing_behavior|missing required/i);
  assert.match(html, /failed scenario|scenario\.happy/i);
  assert.match(html, /unaccounted/i);
  assert.match(html, /coverage/i);
  assert.match(html, /stale|ambiguous/i);
  assert.match(html, /unattested/i);
  assert.match(html, /data-evidence-id="scenario\.happy"/);
  assert.match(html, /data-evidence-id="commitment\.x"/);
  assert.doesNotMatch(html, new RegExp(`class="[^"]*${READY_CHROME_CLASS}`));
  assert.doesNotMatch(html, new RegExp(`>${READY_BADGE_TEXT}<`));
  assert.doesNotMatch(html, /aria-label="Ready"/i);
});

test("ready state is the only path that renders ready chrome", () => {
  const html = renderVerification({
    phase: "ready",
    gate: { state: "ready", reasons: [], coverageRegressions: [], requirementRegressions: [], surfaceProblems: { missing: 0, unaccounted: 0, ambiguous: 0, stale: 0 }, scenarioProblems: [] },
    decisions: [],
  });
  assert.match(html, new RegExp(READY_CHROME_CLASS));
  assert.match(html, new RegExp(READY_BADGE_TEXT));
});

test("failed scenario alone still forbids ready chrome", () => {
  const html = renderVerification(baseVerification({
    phase: "needs_attention",
    gate: {
      state: "needs_attention",
      reasons: ["scenario-failed:scenario.happy"],
      coverageRegressions: [],
      requirementRegressions: [],
      surfaceProblems: { missing: 0, unaccounted: 0, ambiguous: 0, stale: 0 },
      scenarioProblems: [{ id: "scenario.happy", result: "failed", reasons: [] }],
    },
    decisions: [{ kind: "failed_scenario", id: "scenario.happy", label: "Happy path", evidenceIds: ["scenario.happy"] }],
  }));
  assert.doesNotMatch(html, new RegExp(READY_CHROME_CLASS));
  assert.doesNotMatch(html, new RegExp(`aria-label="${READY_BADGE_TEXT}"`, "i"));
});

test("empty verification state is not ready", () => {
  const html = renderVerification({ phase: "empty", gate: null, decisions: [] });
  assert.match(html, /No verification|approve a Seed|run a build/i);
  assert.doesNotMatch(html, new RegExp(READY_CHROME_CLASS));
});

test("gate ready with decisions still omits every ready chrome including lowercase labels", () => {
  const html = renderVerification({
    phase: "ready",
    gate: {
      state: "ready",
      reasons: [],
      coverageRegressions: [],
      requirementRegressions: [],
      surfaceProblems: { missing: 0, unaccounted: 0, ambiguous: 0, stale: 0 },
      scenarioProblems: [],
    },
    decisions: [{ kind: "unattested", id: "repo", label: "stale", evidenceIds: ["provenance"] }],
  });
  assert.doesNotMatch(html, new RegExp(READY_CHROME_CLASS));
  assert.doesNotMatch(html, /aria-label\s*=\s*["'][^"']*ready[^"']*["']/i);
  assert.doesNotMatch(html, />\s*Ready\s*</);
  assert.doesNotMatch(html, />\s*ready\s*</);
});

test("verification lists evidence focus controls for each decision id", () => {
  const html = renderVerification(baseVerification());
  assert.match(html, /evidence-focus/);
  assert.match(html, /data-evidence-target="scenario\.happy"/);
  assert.match(html, /data-evidence-target="commitment\.x"/);
  assert.doesNotMatch(html, /Architecture &amp; evidence drill-down/);
});

test("verification escapes XSS in decision labels", () => {
  const html = renderVerification({
    phase: "needs_attention",
    gate: { state: "needs_attention", reasons: [], coverageRegressions: [], requirementRegressions: [], surfaceProblems: { missing: 0, unaccounted: 0, ambiguous: 0, stale: 0 }, scenarioProblems: [] },
    decisions: [{
      kind: "missing_behavior",
      id: "commitment.x",
      label: `<img src=x onerror="alert(1)">`,
      evidenceIds: ["commitment.x"],
    }],
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});
