import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { scanRepo } from "../../src/scanners/index.js";
import { appendBehaviorsSection } from "../../src/reporters/behaviors-section.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "../fixtures/behaviors-app");
const goldenPath = join(here, "../fixtures/behaviors-app.golden.md");

test("behaviors golden output is stable", async () => {
  const scan = await scanRepo(appDir, { cache: false });
  const lines = [];
  appendBehaviorsSection(lines, scan.behaviors);
  const actual = lines.join("\n") + "\n";

  if (process.env.UPDATE_GOLDEN) {
    await writeFile(goldenPath, actual);
  }
  const expected = await readFile(goldenPath, "utf8");
  assert.equal(actual, expected);
});
