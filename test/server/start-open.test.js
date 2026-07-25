import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { startServer } from "../../src/server/index.js";
import { analyzeCurrentInWorker } from "../../src/server/analyze-in-worker.js";

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "varai-start-open-"));
  execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"], {
    cwd: dir,
    stdio: "ignore",
  });
  return dir;
}

function pendingAnalyze() {
  return new Promise(() => { /* never resolves — keeps initial scan pending */ });
}

test("opens the browser as soon as HTTP listens, before analyze finishes", async (t) => {
  const repo = tempRepo();
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  const opened = [];
  const server = await startServer({
    repoPath: repo,
    port: 0,
    open: true,
    openBrowser: (url) => opened.push(url),
    analyze: pendingAnalyze,
  });
  t.after(() => server.close());

  assert.deepEqual(opened, [server.url], "browser must open on listen, not after scan");

  const html = await fetch(server.url);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Scanning/);
});

test("dashboard HTTP stays responsive while a CPU-bound analyze runs in a worker", async (t) => {
  const repo = tempRepo();
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  // Prove the worker helper keeps the parent event loop free under sync load.
  const busyJobPath = path.join(repo, "busy-job.mjs");
  fs.writeFileSync(busyJobPath, `
    import { parentPort } from "node:worker_threads";
    const end = Date.now() + 800;
    while (Date.now() < end) { /* burn */ }
    parentPort.postMessage({ ok: true, result: { burned: true } });
  `);

  const { Worker } = await import("node:worker_threads");
  let settled = false;
  const worker = new Worker(busyJobPath, { type: "module" });
  const busy = new Promise((resolve, reject) => {
    worker.on("message", (msg) => { settled = true; resolve(msg); void worker.terminate(); });
    worker.on("error", reject);
  });

  let tick = false;
  await new Promise((resolve) => setTimeout(() => { tick = true; resolve(); }, 50));
  assert.equal(tick, true, "parent timers must fire while worker burns CPU");
  assert.equal(settled, false, "worker should still be busy");
  await busy;

  const { promise } = analyzeCurrentInWorker(repo, { cache: false, jobs: 1 });
  const current = await promise;
  assert.ok(current.scan?.model?.schemaVersion);
  assert.equal(current.git.root, path.resolve(repo));
});

test("GET / succeeds before the initial analyze completes", async (t) => {
  const repo = tempRepo();
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  const server = await startServer({
    repoPath: repo,
    port: 0,
    open: false,
    analyze: pendingAnalyze,
  });
  t.after(() => server.close());

  const res = await fetch(new URL("/", server.url));
  assert.equal(res.status, 200);
  const model = await fetch(new URL("/api/model", server.url));
  assert.equal(model.status, 200);
  const body = await model.json();
  assert.equal(body.model, null);
});

test("watcher only attaches to include paths and does not block HTTP on large trees", async (t) => {
  const repo = tempRepo();
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  const bulky = path.join(repo, ".worktrees", "x");
  fs.mkdirSync(bulky, { recursive: true });
  for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(bulky, `f${i}.txt`), "x");

  const includeDir = path.join(repo, "services", "backend");
  fs.mkdirSync(includeDir, { recursive: true });
  fs.writeFileSync(path.join(includeDir, "main.py"), "print(1)\n");

  const server = await startServer({
    repoPath: repo,
    port: 0,
    open: false,
    scanOptions: { include: ["services/backend"] },
    analyze: pendingAnalyze,
  });
  t.after(() => server.close());

  const t0 = Date.now();
  const res = await fetch(server.url, { signal: AbortSignal.timeout(1000) });
  assert.equal(res.status, 200);
  assert.ok(Date.now() - t0 < 1000, "HTTP must answer while watches are set up");
});
