// The seam that broke in ca0fb31: the server stopped sending `observedAreas`
// while src/ui/app.js kept reading it, and the whole suite stayed green. This
// test reads the UI source and asserts that every projection key the UI reaches
// for is a key the server actually sends. It is deliberately source-scraping —
// there is no DOM here, and a type system would be the alternative.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSystemModel } from "../../src/system-model/build.js";
import { serializeProjections } from "../../src/server/projections.js";

const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "ui");

// Matches `projections.things`, `projections?.things`, and
// `projections?.  things` across line breaks.
const PROJECTION_READ = /projections\s*\??\.\s*([A-Za-z_$][\w$]*)/g;

function projectionKeysReadByUi() {
  const keys = new Set();
  for (const file of readdirSync(uiDir).filter((name) => name.endsWith(".js"))) {
    const source = readFileSync(join(uiDir, file), "utf8");
    for (const match of source.matchAll(PROJECTION_READ)) keys.add(match[1]);
  }
  return keys;
}

test("the projection-read regex actually finds reads in the UI source", () => {
  // Guards the test itself: if the UI stops using `projections.` syntax, the
  // contract test would silently pass by matching nothing.
  assert.ok(projectionKeysReadByUi().size > 0, "found no projections.<key> reads in src/ui — the regex is stale");
});

test("every projection key the UI reads is sent by the server", () => {
  const model = buildSystemModel({ subsystems: [], elements: [], claims: [] }, { systemName: "contract-fixture" });
  const sent = new Set(Object.keys(serializeProjections(model)));
  const missing = [...projectionKeysReadByUi()].filter((key) => !sent.has(key)).sort();
  assert.deepEqual(missing, [], `src/ui reads projection keys the server does not send: ${missing.join(", ")}`);
});
