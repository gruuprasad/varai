import path from "node:path";
import { createSnapshot, analyzeCurrent } from "./snapshots/snapshot.js";
import { createSnapshotStore } from "./snapshots/store.js";
import { resolveSnapshotSelector } from "./snapshots/selectors.js";
import { diffAnalyses } from "./diff/index.js";
import { renderSemanticDiff } from "./reporters/diff-markdown.js";
import { readGitState } from "./snapshots/git-state.js";

export async function runSnapshot(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const { manifest } = await createSnapshot(repoPath, options);
  process.stdout.write(`Created semantic snapshot ${manifest.id}\nAnalysis object ${manifest.semanticObjectHash}\nSystem Model object ${manifest.systemModelObjectHash}\nGit ${manifest.git.head}${manifest.git.clean ? " (clean)" : " (dirty)"}\n`);
  return manifest;
}

export async function runLog(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const git = await readGitState(repoPath);
  const snapshots = await createSnapshotStore(git.semanticStoreRoot).listSnapshots();
  if (!snapshots.length) process.stdout.write("No semantic snapshots. Run `varai snapshot`.\n");
  else for (const item of snapshots) process.stdout.write(`${item.id} ${item.git.head.slice(0, 12)} ${item.git.clean ? "clean" : "dirty"} ${item.createdAt}\n`);
  return snapshots;
}

export async function runDiff(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const git = await readGitState(repoPath);
  const store = createSnapshotStore(git.semanticStoreRoot);
  let fromManifest;
  let before;
  let current = null;
  if (options.from) {
    fromManifest = await resolveSnapshotSelector(store, options.from);
  } else {
    current = await analyzeCurrent(repoPath, options);
    const ref = await store.getCommitRef(current.git.head);
    if (!ref) throw new Error("No clean semantic baseline exists for HEAD. Run `varai snapshot` on a clean worktree first.");
    fromManifest = await store.getSnapshot(ref.snapshotId);
  }
  before = await store.getObject(fromManifest.semanticObjectHash);

  let after;
  let toLabel = options.to ?? "current";
  let toConfigHash;
  if (options.to && options.to !== "current") {
    const manifest = await resolveSnapshotSelector(store, options.to);
    after = await store.getObject(manifest.semanticObjectHash);
    toConfigHash = manifest.scanConfigHash;
  } else {
    current ??= await analyzeCurrent(repoPath, options);
    after = current.scan.analysis;
    toConfigHash = current.scanConfigHash;
  }
  if (fromManifest.scanConfigHash !== toConfigHash) throw new Error("Cannot compare analyses made with different scan configurations");
  const diff = diffAnalyses(before, after);
  if (options.json) process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
  else process.stdout.write(renderSemanticDiff(diff, {
    from: fromManifest.id,
    to: toLabel,
    showEvidenceMoves: options.showEvidenceMoves,
  }));
  return diff;
}
