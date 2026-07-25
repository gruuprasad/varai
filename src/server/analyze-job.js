import { parentPort, workerData } from "node:worker_threads";
import { analyzeCurrent } from "../snapshots/snapshot.js";

// Runs the CPU-heavy initial/rescan analyze off the dashboard HTTP thread so
// the UI can load and stream SSE while a large repo is still being scanned.

try {
  const result = await analyzeCurrent(workerData.repoPath, workerData.scanOptions ?? {});
  parentPort.postMessage({ ok: true, result });
} catch (err) {
  parentPort.postMessage({
    ok: false,
    error: { message: err?.message ?? String(err), stack: err?.stack },
  });
}
