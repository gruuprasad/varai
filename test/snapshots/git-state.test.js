import assert from "node:assert/strict";
import test from "node:test";
import { readGitState } from "../../src/snapshots/git-state.js";

test("reads repository HEAD and worktree state without mutation", async () => {
  const state = await readGitState(process.cwd());
  assert.match(state.head, /^[0-9a-f]{40}$/);
  assert.equal(typeof state.clean, "boolean");
  assert.ok(Array.isArray(state.statusLines));
});
