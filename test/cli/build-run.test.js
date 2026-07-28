import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ratifySeed } from "../../src/seed/store.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureCli = path.join(root, "test/fixtures/fake-builder/cli.js");
const bin = path.join(root, "bin/varai.js");

function cli(cwd, ...args) {
  return execFileSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
  });
}

async function repo() {
  const dir = await mkdtemp(path.join(tmpdir(), "varai-build-run-cli-"));
  await writeFile(path.join(dir, "app.py"), "def app():\n    return 1\n");
  await writeFile(path.join(dir, "varai.config.json"), JSON.stringify({
    builders: {
      fake: {
        executable: process.execPath,
        args: [fixtureCli, "--mode", "success", "--packet"],
      },
    },
  }));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-qm", "base"]);
  ratifySeed(dir, slotkeeperDraft(), { ratifiedAt: "2026-07-28T00:00:00.000Z" });
  return dir;
}

test("varai build run --adapter fake takes approved seed through verification", async () => {
  const dir = await repo();
  try {
    const output = cli(dir, "build", "run", "--adapter", "fake", "--json", "--no-cache");
    const parsed = JSON.parse(output);
    assert.ok(parsed.session.completedAt);
    assert.equal(parsed.session.gate.state, "ready");
    assert.equal(parsed.exitCode ?? 0, 0);

    const status = JSON.parse(cli(dir, "build", "status", "--json"));
    assert.equal(status.active, null);
    assert.ok(status.sessions.some((s) => s.id === parsed.session.id));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("varai build run rejects unknown adapter ids", async () => {
  const dir = await repo();
  try {
    assert.throws(
      () => cli(dir, "build", "run", "--adapter", "not-configured"),
      /Unknown adapter|not configured/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
