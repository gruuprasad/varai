import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { readGitState } from "../../src/snapshots/git-state.js";
import { createSnapshotStore } from "../../src/snapshots/store.js";

const exec = promisify(execFile);
const git = (cwd, args) => exec("git", ["-C", cwd, ...args]);

test("linked worktrees resolve the main checkout semantic store", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "varai-worktree-"));
  const main = path.join(parent, "main repo");
  const linked = path.join(parent, "task worktree");
  try {
    await exec("git", ["init", main]);
    await git(main, ["config", "user.email", "varai@example.test"]);
    await git(main, ["config", "user.name", "Varai Test"]);
    await writeFile(path.join(main, "README.md"), "baseline\n");
    await git(main, ["add", "README.md"]);
    await git(main, ["commit", "-m", "baseline"]);
    await git(main, ["worktree", "add", "-b", "task", linked]);

    const mainState = await readGitState(main);
    const linkedState = await readGitState(linked);
    assert.equal(linkedState.semanticStoreRoot, mainState.semanticStoreRoot);
    assert.notEqual(linkedState.root, mainState.root);

    const store = createSnapshotStore(mainState.semanticStoreRoot);
    await store.putSnapshot({
      id: "baseline", formatVersion: 1, modelObjectHash: "object", modelSchemaVersion: 1,
      scannedTreeHash: "tree", scanConfigHash: "config", createdAt: "2026-01-01T00:00:00Z",
      git: { head: mainState.head, clean: true },
    });
    assert.deepEqual(await createSnapshotStore(linkedState.semanticStoreRoot).getCommitRef(mainState.head), { snapshotId: "baseline" });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
