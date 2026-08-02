import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoleReviewPrompt,
  normalizeRoleReview,
  roleReviewStatus,
} from "../../src/development-roles/review.js";
import { parseJsonTranscript } from "../../src/seed/assistants/openai-compatible.js";

test("role review normalization preserves provenance and advisory authority", () => {
  const review = normalizeRoleReview({
    summary: "The API failure path is worth checking.",
    findings: [{ statement: "Failure state is not covered", evidenceIds: ["scenario.failure"], certainty: "inferred" }],
    recommendation: "change",
    proposedChange: "Add an explicit unavailable state.",
  }, {
    roleId: "backend",
    seedHash: "seed-1",
    treeHash: "tree-1",
    sessionId: "build:1",
  });
  assert.equal(review.authority, "advisory_only");
  assert.equal(review.verdictAuthority, "deterministic_verifier_and_human");
  assert.equal(review.role, "backend");
  assert.equal(review.findings[0].id, "review-finding-1-failure-state-is-not-covered");
  assert.equal(review.recommendation, "change");
  assert.equal(review.proposedChange, "Add an explicit unavailable state.");
});

test("role review status exposes stale and unknown provenance", () => {
  const review = { seedHash: "seed-1", treeHash: "tree-1", sessionId: "build:1" };
  assert.deepEqual(roleReviewStatus(review, { seedHash: "seed-1", treeHash: "tree-1", sessionId: "build:1" }), { state: "current", reasons: [] });
  assert.equal(roleReviewStatus(review, { seedHash: "seed-2", treeHash: "tree-1", sessionId: "build:1" }).state, "stale");
  assert.equal(roleReviewStatus(review, { seedHash: null, treeHash: null, sessionId: "build:1" }).state, "unknown");
});

test("role review prompt names the evidence boundary and cannot set the gate", () => {
  const prompt = buildRoleReviewPrompt({ roleId: "verification", seedHash: "seed", treeHash: "tree", sessionId: "build:1" });
  assert.match(prompt, /cannot.*set a readiness verdict/i);
  assert.match(prompt, /deterministic verifier and human remain authoritative/i);
});

test("JSON transcript parser recovers the last matching pretty object", () => {
  const output = `transcript {"summary":"example"}\nfinal:\n{\n  "summary": "real",\n  "recommendation": "accept"\n}`;
  assert.deepEqual(parseJsonTranscript(output, (value) => value?.recommendation === "accept"), {
    summary: "real",
    recommendation: "accept",
  });
});
