import fs from "node:fs";
import path from "node:path";
import { REALIZATION_FILE, validateRealization } from "./schema.js";

// Loading for the builder witness. The witness is read-only input to
// reconciliation; Varai never writes it (the builder does), and it never
// enters a System Model snapshot.

export function realizationPath(repoPath) {
  const root = path.resolve(repoPath);
  const target = path.resolve(root, REALIZATION_FILE);
  if (path.dirname(target) !== root) throw new Error(`Realization path escapes the repository root: ${target}`);
  return target;
}

export function readRealization(repoPath, { seed } = {}) {
  const target = realizationPath(repoPath);
  if (!fs.existsSync(target)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (err) {
    throw new Error(`Cannot parse ${REALIZATION_FILE}: ${err.message}`);
  }
  validateRealization(parsed, { seed });
  return { realization: parsed, path: target };
}
