#!/usr/bin/env node
/** Explicit Gate 8 runner — fails if the sibling POC is missing. */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPocExists, resolvePocPath } from "../test/poc/purchase-approvals-harness.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  assertPocExists(resolvePocPath());
} catch (err) {
  console.error(err.message);
  console.error("Create the sibling POC or set VARAI_POC_PATH.");
  process.exit(1);
}

const testFile = path.join(root, "test/poc/purchase-approvals-trials.test.js");
const child = spawn(process.execPath, ["--test", testFile], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
