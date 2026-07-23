import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startServer } from "../../src/server/index.js";

// Regression guard for the whole browser ESM graph. app.js pulls in UI modules
// that in turn import shared modules from ../reporters (glossary/labels). The
// static server flattens paths to a basename under src/ui, so a request for
// /reporters/display-language.js used to 404 — which silently broke module
// loading and left the UI frozen on "Scanning...". Nothing in the suite caught
// it because no test fetched the served assets. This walks the graph the way a
// browser does (resolving import specifiers against each module's URL) and
// asserts every reachable module is served with a JS content type.

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "varai-static-"));
}

// Match static `import ... from "x"`, bare `import "x"`, and `export ... from "x"`.
function relativeSpecifiers(source) {
  const specs = new Set();
  const fromRe = /(?:import|export)[^"';]*?from\s*["']([^"']+)["']/g;
  const bareRe = /import\s*["']([^"']+)["']/g;
  for (const re of [fromRe, bareRe]) {
    let match;
    while ((match = re.exec(source)) !== null) {
      const spec = match[1];
      if (spec.startsWith(".") || spec.startsWith("/")) specs.add(spec);
    }
  }
  return [...specs];
}

test("every module in the browser's ESM graph is served (no 404 that breaks app.js)", async (t) => {
  const repo = tempRepo();
  const server = await startServer({ repoPath: repo, port: 0, open: false, scanOptions: { jobs: 1, cache: false } });
  t.after(() => server.close());

  const entry = new URL("/app.js", server.url).href; // index.html loads <script type="module" src="/app.js">
  const visited = new Set();
  const queue = [entry];
  const failures = [];

  while (queue.length) {
    const moduleUrl = queue.shift();
    if (visited.has(moduleUrl)) continue;
    visited.add(moduleUrl);

    const response = await fetch(moduleUrl);
    const contentType = response.headers.get("content-type") ?? "";
    if (response.status !== 200 || !contentType.includes("javascript")) {
      failures.push(`${moduleUrl} -> ${response.status} ${contentType}`);
      continue;
    }
    const source = await response.text();
    for (const spec of relativeSpecifiers(source)) {
      queue.push(new URL(spec, moduleUrl).href);
    }
  }

  assert.deepEqual(failures, [], `Unreachable browser modules:\n${failures.join("\n")}`);
  // Sanity: we actually traversed a graph and reached the shared glossary.
  assert.ok(visited.size >= 4, `expected to walk several modules, walked ${visited.size}`);
  assert.ok(
    [...visited].some((url) => url.endsWith("/reporters/display-language.js")),
    "expected the graph to include /reporters/display-language.js",
  );
});
