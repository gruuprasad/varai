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


// Atomic write for `varai runtime derive --write`. The runtime map is a
// builder-owned pointer; Varai only ever writes it with an explicit flag.
export function writeRuntimeMapAtomically(repoPath, runtime) {
  const target = runtimePath(repoPath);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporary, target);
  } catch (err) {
    try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    throw err;
  }
  return target;
}
