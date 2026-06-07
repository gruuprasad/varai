import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const IGNORE_DIRS = new Set([
  ".varai", "node_modules", ".git", "dist", "__pycache__",
  ".venv", "venv", ".pytest_cache", ".mypy_cache",
]);

const DEBOUNCE_MS = 2000;

export function createWatcher(repoPath, onChange) {
  let timer = null;
  let pending = false;
  const watchers = [];

  const schedule = () => {
    if (pending) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = false;
      onChange();
    }, DEBOUNCE_MS);
  };

  function onEvent(eventType, filename) {
    if (!filename) return;
    const parts = filename.split(path.sep);
    for (const part of parts) {
      if (IGNORE_DIRS.has(part)) return;
    }
    schedule();
  }

  function onError(err) {
    if (err.code !== "EPERM" && err.code !== "ENOENT" && err.code !== "ENOSPC") {
      console.error("[watcher] error:", err.message);
    }
  }

  function addWatcher(dirPath) {
    const w = watch(dirPath, { recursive: true }, onEvent);
    w.on("error", onError);
    watchers.push(w);
  }

  async function setupWatches() {
    let entries;
    try {
      entries = await readdir(repoPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
        addWatcher(path.join(repoPath, entry.name));
      }
    }
  }

  setupWatches();

  return {
    close() {
      clearTimeout(timer);
      for (const w of watchers) w.close();
    }
  };
}
