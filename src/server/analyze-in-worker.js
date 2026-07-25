import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

const jobPath = fileURLToPath(new URL("./analyze-job.js", import.meta.url));

export class AnalyzeAbortedError extends Error {
  constructor(message = "analyze worker aborted") {
    super(message);
    this.name = "AnalyzeAbortedError";
  }
}

/**
 * Run analyzeCurrent in a worker thread.
 * Returns { worker, promise } so callers can terminate on shutdown.
 */
export function analyzeCurrentInWorker(repoPath, scanOptions = {}) {
  let settled = false;
  const worker = new Worker(jobPath, {
    workerData: { repoPath, scanOptions },
    type: "module",
  });

  const promise = new Promise((resolve, reject) => {
    worker.on("message", (msg) => {
      if (settled) return;
      settled = true;
      if (msg?.ok) resolve(msg.result);
      else reject(new Error(msg?.error?.message || "analyze worker failed"));
      void worker.terminate();
    });
    worker.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    worker.on("exit", (code) => {
      if (settled) return;
      settled = true;
      // terminate() during server shutdown exits 0/1 without a result message.
      reject(new AnalyzeAbortedError(`analyze worker exited with code ${code}`));
    });
  });

  return { worker, promise };
}
