import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRepoConfig } from "../scanners/config.js";
import { createWatcher } from "./watcher.js";
import { analyzeCurrent, persistCurrentAnalysis } from "../snapshots/snapshot.js";
import { createSnapshotStore } from "../snapshots/store.js";
import { diffAnalyses } from "../diff/index.js";
import { readGitState } from "../snapshots/git-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, "..", "ui");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveFile(res, filePath, repoPath = "") {
  try {
    let content = fs.readFileSync(filePath, "utf8");
    const ext = path.extname(filePath);
    if (ext === ".html") {
      content = content.replace("{{REPO_PATH}}", escHtml(repoPath));
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serveJSON(res, data) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(data));
}

function openBrowser(url) {
  const cmd = process.platform === "darwin"
    ? `open "${url}"`
    : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error("[server] failed to open browser:", err.message);
  });
}

export async function startServer({ repoPath, port = 3847, open = true, scanOptions: cliScanOptions = {} }) {
  const absRepo = path.resolve(repoPath);
  const config = await loadRepoConfig(absRepo);
  const scanOptions = {
    ...cliScanOptions,
    include: cliScanOptions.include?.length ? cliScanOptions.include : (config.include ?? []),
    config,
  };
  for (const key of Object.keys(scanOptions)) if (scanOptions[key] === undefined) delete scanOptions[key];

  let latestScan = null;
  let latestDiff = null;
  let scanning = false;
  let sseClients = new Set();

  async function runScan() {
    if (scanning) return;
    scanning = true;
    try {
      const current = await analyzeCurrent(absRepo, scanOptions);
      latestScan = current.scan;
      const store = createSnapshotStore(current.git.semanticStoreRoot);
      let ref = await store.getCommitRef(current.git.head);
      if (current.git.clean && !ref) {
        const created = await persistCurrentAnalysis(absRepo, current);
        ref = { snapshotId: created.manifest.id };
      }
      if (ref) {
        const baseline = await store.getSnapshot(ref.snapshotId);
        if (baseline.scanConfigHash === current.scanConfigHash) {
          latestDiff = { baseline, diff: diffAnalyses(await store.getObject(baseline.semanticObjectHash), latestScan.analysis) };
          broadcast({ type: "semantic-diff", data: latestDiff });
        } else {
          latestDiff = { error: "Baseline uses a different scan configuration" };
        }
      } else {
        latestDiff = { error: "No clean semantic baseline exists for HEAD" };
      }
      broadcast({ type: "scan", data: latestScan });
    } catch (err) {
      console.error("[server] scan error:", err.message);
      broadcast({ type: "error", message: err.message });
    } finally {
      scanning = false;
    }
  }

  function broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch { /* client disconnected */ }
    }
  }

  const watcher = createWatcher(absRepo, () => {
    console.error("[server] change detected, rescanning...");
    runScan();
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === "/api/scan") {
      serveJSON(res, latestScan || { summary: null, stacks: [], files: [], facts: [] });
      return;
    }

    if (url.pathname === "/api/snapshots") {
      readGitState(absRepo)
        .then((git) => createSnapshotStore(git.semanticStoreRoot).listSnapshots())
        .then((items) => serveJSON(res, items), (err) => {
          res.writeHead(500); res.end(err.message);
        });
      return;
    }

    if (url.pathname === "/api/diff") {
      serveJSON(res, latestDiff || { error: "Semantic diff is not ready" });
      return;
    }

    if (url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(":\n\n"); // SSE comment to establish connection
      sseClients.add(res);

      if (latestScan) {
        res.write(`data: ${JSON.stringify({ type: "scan", data: latestScan })}\n\n`);
      }
      if (latestDiff) res.write(`data: ${JSON.stringify({ type: "semantic-diff", data: latestDiff })}\n\n`);

      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    // Static file serving
    let filePath;
    if (url.pathname === "/" || url.pathname === "/index.html") {
      filePath = path.join(UI_DIR, "index.html");
    } else if (url.pathname.startsWith("/") && !url.pathname.includes("..")) {
      const safeName = path.basename(url.pathname);
      filePath = path.join(UI_DIR, safeName);
    } else {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    serveFile(res, filePath, absRepo);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => {
      const url = `http://localhost:${port}`;
      console.error(`[server] listening on ${url}`);
      console.error(`[server] scanning ${absRepo}...`);

      runScan().then(() => {
        if (open) openBrowser(url);
      });

      resolve({
        url,
        port,
        close() {
          watcher.close();
          server.close();
          for (const c of sseClients) {
            try { c.end(); } catch { /* */ }
          }
          sseClients.clear();
        }
      });
    });

    server.on("error", reject);
  });
}
