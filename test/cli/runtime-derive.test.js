import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = path.join(root, "bin/varai.js");
const fixture = path.join(root, "test/fixtures/purchase-approval-runtime");

function cli(repo, ...args) {
  return execFileSync(process.execPath, [bin, ...args, repo, "--no-cache"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
      VARAI_POC_EMPLOYEE_1_TOKEN: "fixture-employee-1-token",
      VARAI_POC_MANAGER_1_TOKEN: "fixture-manager-1-token",
    },
  });
}

test("runtime derive regenerates operations while preserving the profile", () => {
  const out = cli(fixture, "runtime", "derive", "--json");
  const derived = JSON.parse(out);
  assert.equal(derived.ok, true);
  assert.equal(derived.profileSource, "current-runtime-map");
  assert.equal(derived.unresolved.length, 0);
  const behaviors = derived.runtime.operations.map((operation) => operation.behavior);
  assert.ok(behaviors.includes("behavior.submit-request"));
  assert.ok(behaviors.includes("behavior.withdraw-request"));
  assert.equal(derived.runtime.seedHash.length, 71);
});

test("runtime derive --write writes a valid runtime map", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-derive-write-"));
  try {
    await cp(fixture, dir, { recursive: true });
    execFileSync("git", ["init", "-q", dir]);
    execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "Test"]);
    execFileSync("git", ["-C", dir, "add", "."]);
    execFileSync("git", ["-C", dir, "commit", "-qm", "base"]);
    cli(dir, "runtime", "derive", "--write");
    const written = JSON.parse(await readFile(path.join(dir, "varai.runtime.json"), "utf8"));
    assert.equal(written.formatVersion, 1);
    assert.ok(written.operations.length >= 1);
    assert.equal(written.baseUrl, "http://127.0.0.1:PORT");
    assert.ok(written.personas.length >= 1);
    const out = cli(dir, "runtime", "derive", "--json");
    assert.equal(JSON.parse(out).ok, true, "re-derived map remains derivable after write");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
