import fs from "node:fs";
import path from "node:path";
import { RUNTIME_FILE } from "./schema.js";
import { validateRuntimeMap } from "./validate.js";

export function runtimePath(repoPath) {
  const root = path.resolve(repoPath);
  const target = path.resolve(root, RUNTIME_FILE);
  if (path.dirname(target) !== root) throw new Error(`Runtime path escapes the repository root: ${target}`);
  return target;
}

export function readRuntimeMap(repoPath, { expectedSeedHash } = {}) {
  const target = runtimePath(repoPath);
  if (!fs.existsSync(target)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (err) {
    throw new Error(`Cannot parse ${RUNTIME_FILE}: ${err.message}`);
  }
  validateRuntimeMap(parsed, { expectedSeedHash });
  return { runtime: parsed, path: target };
}
