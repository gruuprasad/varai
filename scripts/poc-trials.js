#!/usr/bin/env node
/** Convenience runner for Gate 8 purchase-approval adversarial trials. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testFile = path.join(root, "test/poc/purchase-approvals-trials.test.js");
const child = spawn(process.execPath, ["--test", testFile], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
