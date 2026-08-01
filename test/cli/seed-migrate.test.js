import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { slotkeeperDraft } from "../seed/fixtures.js";

function cli(...args) {
  return execFileSync(process.execPath, ["./bin/varai.js", ...args], { encoding: "utf8" });
}

test("seed migrate prints a v4 draft without writing unless requested", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "varai-seed-migrate-"));
  writeFileSync(path.join(repo, "varai.seed.json"), JSON.stringify(slotkeeperDraft()));
  const printed = JSON.parse(cli("seed", "migrate", repo));
  assert.equal(printed.formatVersion, 4);
  assert.deepEqual(printed.surfaces, []);
  assert.deepEqual(printed.scenarios, []);
  assert.deepEqual(printed.flows, []);
  assert.deepEqual(printed.ratification, { status: "draft" });
  assert.equal(JSON.parse(readFileSync(path.join(repo, "varai.seed.json"), "utf8")).formatVersion, 1);
  cli("seed", "migrate", repo, "--write");
  const written = JSON.parse(readFileSync(path.join(repo, "varai.seed.json"), "utf8"));
  assert.equal(written.formatVersion, 4);
  assert.deepEqual(written.surfaces, []);
  assert.deepEqual(written.scenarios, []);
  assert.deepEqual(written.flows, []);
});
