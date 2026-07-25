import { watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const IGNORE_DIRS = new Set([
  ".varai", "node_modules", ".git", "dist", "__pycache__",
  ".venv", "venv", ".pytest_cache", ".mypy_cache",
  // Agent/tool/worktree trees are huge and are not scan inputs. Watching them
  // recursively blocks the dashboard event loop for many seconds on mid-size repos.
  ".worktrees", ".claude", ".codex", ".cursor", ".agents", ".github",
  ".hypothesis", ".impeccable", ".kamal", ".kilo", ".kiro", ".memsearch",
  ".ocx", ".opencode", ".pi", ".playwright-cli", ".ruff_cache", ".superpowers",
  ".tools", ".trae", ".vscode", ".idea", "htmlcov", "coverage",
]);

const DEBOUNCE_MS = 2000;

function yieldEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * @param {string} repoPath
 * @param {() => void} onChange
 * @param {{ include?: string[] }} [options]
 */
export function createWatcher(repoPath, onChange, options = {}) {
  let timer = null;
  let pending = false;
  const watchers = [];
  let closed = false;

  const schedule = () => {
    if (pending || closed) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = false;
      if (!closed) onChange();
    }, DEBOUNCE_MS);
  };

  function onEvent(_eventType, filename) {
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
    if (closed) return;
    const w = watch(dirPath, { recursive: true }, onEvent);
    w.on("error", onError);
    watchers.push(w);
  }

  async function setupWatches() {
    const include = (options.include ?? []).filter(Boolean);
    if (include.length) {
      for (const rel of include) {
        if (closed) return;
        const abs = path.resolve(repoPath, rel);
        try {
          const s = await stat(abs);
          if (s.isDirectory()) addWatcher(abs);
          else if (s.isFile()) addWatcher(path.dirname(abs));
        } catch {
          /* include path missing — skip */
        }
        await yieldEventLoop();
      }
      return;
    }

    let entries;
    try {
      entries = await readdir(repoPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (closed) return;
      if (entry.isDirectory() && !IGNORE_DIRS.has(entry.name)) {
        addWatcher(path.join(repoPath, entry.name));
        // recursive fs.watch() is sync and can take seconds per large tree;
        // yield so the dashboard HTTP thread can answer requests during setup.
        await yieldEventLoop();
      }
    }
  }

  setupWatches();

  return {
    close() {
      closed = true;
      clearTimeout(timer);
      for (const w of watchers) w.close();
    }
  };
}
