import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../src/scanners/index.js";
import { diffAnalyses } from "../src/diff/index.js";
import { renderSemanticDiff } from "../src/reporters/diff-markdown.js";

const fixture = path.resolve("test/fixtures/frontend-interaction");

test("frontend dismissal guard is one semantic behavior change", async () => {
  const options = { cache: false, jobs: 1 };
  const before = await scanRepo(path.join(fixture, "before"), options);
  const after = await scanRepo(path.join(fixture, "after"), options);
  const oldBehavior = before.analysis.behaviors.find((item) => item.door.kind === "ui_action");
  const newBehavior = after.analysis.behaviors.find((item) => item.door.kind === "ui_action");

  assert.ok(oldBehavior);
  assert.equal(oldBehavior.id, newBehavior.id);
  assert.equal(oldBehavior.guards.length, 0);
  assert.equal(newBehavior.guards.length, 1);
  assert.equal(newBehavior.guards[0].kind, "disabled_when");
  assert.equal(newBehavior.guards[0].condition, "loading");
  assert.equal(newBehavior.guards[0].evidence.length, 2);

  const diff = diffAnalyses(before.analysis, after.analysis);
  assert.equal(diff.behaviors.added.length, 0);
  assert.equal(diff.behaviors.removed.length, 0);
  assert.equal(diff.behaviors.changed.length, 1);
  assert.equal(diff.behaviors.changed[0].clauses.length, 1);
  assert.equal(diff.behaviors.changed[0].clauses[0].kind, "guards");
  assert.match(renderSemanticDiff(diff), /~ CreateProjectModal dismissal[\s\S]*\+ disabled when loading/);
});
