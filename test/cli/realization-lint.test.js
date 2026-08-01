import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = path.join(root, "bin/varai.js");
const fixture = path.join(root, "test/fixtures/semantic-assembly-structural");

function cli(repo, ...args) {
  return execFileSync(process.execPath, [bin, ...args, repo, "--no-cache"], {
    encoding: "utf8",
    env: { ...process.env },
  });
}

test("realization lint exits 0 for an actionable witness", () => {
  const out = cli(fixture, "realization", "lint", path.join(fixture, "varai.realization.json"));
  assert.ok(out.includes("Actionable: every binding resolves"), out);
});

test("realization lint --json reports resolved bindings machine-readably", () => {
  const out = cli(fixture, "realization", "lint", path.join(fixture, "varai.realization.json"), "--json");
  const lint = JSON.parse(out);
  assert.equal(lint.valid, true);
  assert.equal(lint.seedMatches, true);
  assert.ok(lint.summary.bindings.resolved > 0);
});

test("realization lint exits 1 and suggests candidates for a wrong selector", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-lint-"));
  try {
    const witness = JSON.parse(await readFile(path.join(fixture, "varai.realization.json"), "utf8"));
    witness.bindings[0].artifact = { lens: "ui", kind: "action", key: "Totally wrong key" };
    const file = path.join(dir, "wrong.json");
    await writeFile(file, JSON.stringify(witness, null, 2));
    let failed = false;
    let out = "";
    try {
      out = cli(fixture, "realization", "lint", file);
    } catch (err) {
      failed = true;
      out = err.stdout ?? "";
    }
    assert.equal(failed, true, "non-actionable witness exits non-zero");
    assert.ok(out.includes("not-found"), out);
    assert.ok(out.includes("candidates (ranked, never chosen)"), out);
    assert.ok(out.includes("Actionable: no"), out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("realization lint rejects a witness with an out-of-date seed hash", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-lint-stale-"));
  try {
    const witness = JSON.parse(await readFile(path.join(fixture, "varai.realization.json"), "utf8"));
    witness.seedHash = "sha256:" + "0".repeat(64);
    const file = path.join(dir, "stale.json");
    await writeFile(file, JSON.stringify(witness, null, 2));
    let failed = false;
    let out = "";
    try {
      out = cli(fixture, "realization", "lint", file);
    } catch (err) {
      failed = true;
      out = err.stdout ?? "";
    }
    assert.equal(failed, true);
    assert.ok(out.includes("OUT OF DATE"), out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
