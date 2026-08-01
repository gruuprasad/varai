import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const bin = path.resolve("bin/varai.js");

test("create initializes a safe Codex-backed Varai project", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "varai-create-"));
  const repo = path.join(parent, "signal");
  execFileSync(process.execPath, [bin, "create", repo], { encoding: "utf8" });
  const config = JSON.parse(fs.readFileSync(path.join(repo, "varai.config.json"), "utf8"));
  assert.equal(config.assistant.executable, "codex");
  assert.equal(config.builders.codex.packetMode, "argument");
  assert.equal(execFileSync("git", ["-C", repo, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).trim(), "true");
  assert.throws(
    () => execFileSync(process.execPath, [bin, "create", repo], { stdio: "pipe" }),
    /Command failed/,
  );
});
