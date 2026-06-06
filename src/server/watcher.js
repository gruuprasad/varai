import { watch } from "node:fs";
import path from "node:path";

const IGNORE_DIRS = new Set([
  ".varai", "node_modules", ".git", "dist", "__pycache__"
]);

const DEBOUNCE_MS = 2000;

export function createWatcher(repoPath, onChange) {
  let timer = null;
  let pending = false;

  const schedule = () => {
    if (pending) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = false;
      onChange();
    }, DEBOUNCE_MS);
  };

  const watcher = watch(repoPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const parts = filename.split(path.sep);
    for (const part of parts) {
      if (IGNORE_DIRS.has(part)) return;
    }

    schedule();
  });

  watcher.on("error", (err) => {
    // fs.watch on Linux can emit EPERM for rapidly deleted dirs; suppress noise.
    if (err.code !== "EPERM" && err.code !== "ENOENT") {
      console.error("[watcher] error:", err.message);
    }
  });

  return {
    close() {
      clearTimeout(timer);
      watcher.close();
    }
  };
}
