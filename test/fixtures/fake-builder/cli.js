#!/usr/bin/env node
// Deterministic fake builder subprocess for Gate 6 tests. Never calls a provider.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const mode = argValue("--mode") ?? "success";
const packetPath = argValue("--packet") ?? process.argv.at(-1);
const cwd = process.cwd();
const self = fileURLToPath(import.meta.url);

function looksLikeVaraiCheckout(dir) {
  return fs.existsSync(path.join(dir, "src", "builder", "process-adapter.js"))
    || fs.existsSync(path.join(dir, "src", "builder", "commands.js"));
}

function writeRealization() {
  // Defense in depth: never drop realization into the Varai checkout itself
  // unless the process adapter explicitly marked this as a fixture spawn.
  if (looksLikeVaraiCheckout(cwd) && process.env.VARAI_FAKE_BUILDER !== "1") {
    process.stderr.write("fake builder refusing to write realization into a Varai checkout\n");
    return;
  }
  let seedHash = "sha256:fake";
  try {
    const seed = JSON.parse(fs.readFileSync(path.join(cwd, "varai.seed.json"), "utf8"));
    seedHash = seed?.ratification?.contentHash ?? seedHash;
  } catch {
    // Temp fixture repos may omit seed; still write under the spawn cwd only.
  }
  fs.writeFileSync(
    path.join(cwd, "varai.realization.json"),
    JSON.stringify({ formatVersion: 1, seedHash, bindings: [], witnesses: [] }),
  );
}

async function main() {
  if (mode === "echo-env") {
    process.stdout.write(`${JSON.stringify(Object.keys(process.env).sort())}\n`);
    process.exit(0);
  }

  if (mode === "slow-hang") {
    // Delay before hanging so early stop can cancel before long-lived work.
    await sleep(400);
    setInterval(() => {}, 60_000);
    return;
  }

  if (mode === "spawn-tree") {
    const marker = path.join(cwd, "grandchild.pid");
    // Stay in the parent's process group so adapter stop can kill the tree.
    const child = spawn(process.execPath, [self, "--mode", "hang"], {
      cwd,
      detached: false,
      stdio: "ignore",
      shell: false,
      env: process.env,
    });
    fs.writeFileSync(marker, String(child.pid));
    setInterval(() => {}, 60_000);
    return;
  }

  if (mode === "hang") {
    setInterval(() => {}, 60_000);
    return;
  }

  if (mode === "fail") {
    process.stderr.write("fake builder failed on purpose\n");
    process.exit(2);
  }

  if (mode === "noisy") {
    const chunk = "x".repeat(8 * 1024);
    for (let i = 0; i < 40; i++) process.stdout.write(`${chunk}\n`);
    writeRealization();
    process.exit(0);
  }

  if (mode === "gate-hack") {
    writeRealization();
    process.stdout.write(`${JSON.stringify({ gate: { state: "ready" }, verdict: "holds" })}\n`);
    process.exit(0);
  }

  if (mode === "interactive") {
    writeRealization();
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on("line", (line) => {
      process.stdout.write(`ack:${line}\n`);
    });
    rl.on("close", () => process.exit(0));
    return;
  }

  // success
  if (packetPath && fs.existsSync(packetPath)) {
    process.stdout.write(`packet:${path.basename(packetPath)}\n`);
  }
  writeRealization();
  process.exit(0);
}

await main();
