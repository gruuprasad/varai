import path from "node:path";

/** In-process live builder runs. Lost on restart — status must not invent a process. */

const liveRuns = new Map();

export function liveKey(repoPath) {
  return path.resolve(repoPath);
}

export function getLiveBuilderRun(repoPath) {
  return liveRuns.get(liveKey(repoPath)) ?? null;
}

export function setLiveBuilderRun(repoPath, handle) {
  liveRuns.set(liveKey(repoPath), handle);
  return handle;
}

export function clearLiveBuilderRun(repoPath) {
  liveRuns.delete(liveKey(repoPath));
}

export function clearLiveBuilderRuns() {
  liveRuns.clear();
}

export function hasLiveBuilderRun(repoPath) {
  return liveRuns.has(liveKey(repoPath));
}
