// test/architecture/layering.test.js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const CORE_DIRS = ["src/system-model", "src/snapshots", "src/scanners", "src/reporters"];

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("core never imports from the server or UI layers", () => {
  for (const dir of CORE_DIRS) {
    for (const file of jsFiles(dir)) {
      const content = readFileSync(file, "utf8");
      assert.ok(!/from\s+["'][^"']*\/(server|ui)\//.test(content), `${file} imports from server/ui`);
    }
  }
});

test("relation display labels are defined exactly once, in core display language", () => {
  const owner = path.normalize("src/reporters/display-language.js");
  const offenders = [];
  for (const dir of ["src", "bin"]) {
    for (const file of jsFiles(dir)) {
      if (path.normalize(file) === owner) continue;
      if (readFileSync(file, "utf8").includes('"is triggered by"')) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});
