import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { renderSystemModel } from "../../src/reporters/system-model-markdown.js";

test("renderer uses system language and exposes partial coverage", async () => {
  const scan = await scanRepo(path.resolve("test/fixtures/frontend-interaction/after"), { jobs: 1, cache: false });
  const output = renderSystemModel({ model: scan.systemModel });
  assert.match(output, /CreateProjectModal offers Dismiss/);
  assert.match(output, /CreateProjectModal Dismiss is available when not loading/);
  assert.match(output, /ui\.availability \(UI\): \*\*partial\*\*/);
  assert.doesNotMatch(output, /FastAPI|React|onClose/);
});
