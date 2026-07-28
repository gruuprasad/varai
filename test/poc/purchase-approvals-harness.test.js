import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { looksLikePoc, resolvePocPath } from "./purchase-approvals-harness.js";

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `varai-poc-path-${label}-`));
}

test("resolvePocPath honors VARAI_POC_PATH override", () => {
  const root = tempDir("env");
  try {
    const forced = path.join(root, "forced-poc");
    fs.mkdirSync(forced);
    fs.writeFileSync(path.join(forced, "varai.seed.json"), "{}\n");
    const resolved = resolvePocPath({
      env: { VARAI_POC_PATH: forced },
      startDir: root,
    });
    assert.equal(resolved, path.resolve(forced));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePocPath finds sibling of a varai checkout by walking up", () => {
  const parent = tempDir("walk");
  try {
    const varaiRoot = path.join(parent, "varai");
    const worktree = path.join(varaiRoot, ".worktrees", "feat", "slice");
    const poc = path.join(parent, "varai-purchase-approvals-poc");
    fs.mkdirSync(worktree, { recursive: true });
    fs.mkdirSync(poc, { recursive: true });
    fs.writeFileSync(path.join(poc, "varai.seed.json"), "{}\n");
    const resolved = resolvePocPath({
      env: {},
      startDir: worktree,
      gitCommonDir: null,
    });
    assert.equal(resolved, path.resolve(poc));
    assert.equal(looksLikePoc(resolved), true);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("looksLikePoc is false for missing paths", () => {
  assert.equal(looksLikePoc("/nonexistent-varai-poc-path"), false);
});
