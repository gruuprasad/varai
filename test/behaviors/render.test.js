import assert from "node:assert/strict";
import test from "node:test";
import { appendBehaviorsSection } from "../../src/reporters/behaviors-section.js";

test("renders bundle header, subject, ceremony, and plain-word behavior lines", () => {
  const result = { bundles: [{
    name: "building-model", jobScoped: true,
    subject: { label: "building-model document", medium: "file", perJob: true },
    derived: ["quantities", "elevation"],
    ceremony: { steps: ["check revision", "persist", "save undo"], followed: 33, total: 33, deviants: [] },
    behaviors: [
      { door: { method: "GET", path: "/api/v1/building-model/{job_id}/quantities" },
        requires: [{ name: "get_job_context", kind: "dependency" }], takes: [], gives: [{ schema: "QuantitiesResponse" }],
        reads: [], writes: [], fails: [{ status: 409 }], untraced: [] },
      { door: { method: "POST", path: "/api/v1/building-model/{job_id}/render" },
        requires: [{ name: "get_job_context", kind: "dependency" }], takes: [], gives: [{ schema: "RenderResponse" }],
        reads: [], writes: [{ target: "file", medium: "file" }, { target: "ProjectArtifact", medium: "db" }], fails: [], untraced: [] },
    ],
  }]};
  const lines = [];
  appendBehaviorsSection(lines, result);
  const out = lines.join("\n");
  assert.ok(out.includes("## Behaviors (2 across 1 bundles)"));
  assert.ok(out.includes("### building-model (2) — job-scoped"));
  assert.ok(out.includes("Subject: building-model document (file"));
  assert.ok(out.includes("mutation ceremony: check revision · persist · save undo — followed by 33/33"));
  assert.ok(out.includes("reads only"));
  assert.ok(out.includes("stores file") && out.includes("db (ProjectArtifact)"));
});
