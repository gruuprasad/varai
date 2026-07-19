import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { renderSystemModel } from "../../src/reporters/system-model-markdown.js";

test("renderer uses system language and exposes partial coverage", async () => {
  const scan = await scanRepo(path.resolve("test/fixtures/frontend-interaction/after"), { jobs: 1, cache: false });
  const output = renderSystemModel({ model: scan.model });
  assert.match(output, /CreateProjectModal Dismiss.*reached through CreateProjectModal/);
  assert.match(output, /CreateProjectModal Dismiss is available when not loading/);
  assert.match(output, /ui\.availability \(UI\): \*\*partial\*\*/);
  assert.doesNotMatch(output, /FastAPI|React|onClose/);
});

test("map report is subjects-first with screens nesting panels", async () => {
  const scan = await scanRepo(path.resolve("test/fixtures/anchor-lift/base"), { jobs: 1, cache: false });
  const output = renderSystemModel({ model: scan.model });
  assert.match(output, /## Subjects/);
  assert.match(output, /### BuildingDocument/);
  assert.match(output, /_in-memory model_/);
  assert.match(output, /## Screens/);
  assert.match(output, /### \/plan/);
  assert.match(output, /BuildingToolbar/);
  assert.match(output, /Not placed on a screen/);
  assert.match(output, /OrphanPanel/);
  assert.match(output, /## What varai couldn't determine/);
  assert.ok(output.indexOf("## Subjects") < output.indexOf("## Screens"));
  assert.ok(output.indexOf("### BuildingDocument") < output.indexOf("## Screens"));
  assert.doesNotMatch(output, /## Browse by thing/);
});
