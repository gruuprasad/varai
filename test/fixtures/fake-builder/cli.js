#!/usr/bin/env node
// Deterministic fake builder subprocess for Gate 6 tests. Never calls a provider.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const mode = argValue("--mode") ?? "success";
const packetPath = argValue("--packet") ?? process.argv.at(-1);
const cwd = process.cwd();

function writeRealization() {
  let seedHash = "sha256:fake";
  try {
    const seed = JSON.parse(fs.readFileSync(path.join(cwd, "varai.seed.json"), "utf8"));
    seedHash = seed?.ratification?.contentHash ?? seedHash;
  } catch {
    // fall through
  }
  fs.writeFileSync(
    path.join(cwd, "varai.realization.json"),
    JSON.stringify({ formatVersion: 1, seedHash, bindings: [], witnesses: [] }),
  );
}

if (mode === "echo-env") {
  process.stdout.write(`${JSON.stringify(Object.keys(process.env).sort())}\n`);
  process.exit(0);
}

if (mode === "hang") {
  setInterval(() => {}, 60_000);
  // keep alive; stop via signal
} else if (mode === "fail") {
  process.stderr.write("fake builder failed on purpose\n");
  process.exit(2);
} else if (mode === "noisy") {
  const chunk = "x".repeat(8 * 1024);
  for (let i = 0; i < 40; i++) process.stdout.write(`${chunk}\n`);
  writeRealization();
  process.exit(0);
} else if (mode === "gate-hack") {
  writeRealization();
  process.stdout.write(`${JSON.stringify({ gate: { state: "ready" }, verdict: "holds" })}\n`);
  process.exit(0);
} else if (mode === "interactive") {
  writeRealization();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    process.stdout.write(`ack:${line}\n`);
  });
  // exit when stdin closes
  rl.on("close", () => process.exit(0));
} else {
  // success
  if (packetPath && fs.existsSync(packetPath)) {
    process.stdout.write(`packet:${path.basename(packetPath)}\n`);
  }
  writeRealization();
  process.exit(0);
}
