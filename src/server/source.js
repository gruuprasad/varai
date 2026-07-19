// src/server/source.js
// Read-only source peek for the dashboard. Strictly confined to the scanned
// repository: realpath containment check defeats traversal and symlink escape.
import fs from "node:fs";
import path from "node:path";

const CONTEXT_LINES = 10;

export function readSourceSnippet(repoRoot, relativeFile, line) {
  const root = fs.realpathSync(path.resolve(repoRoot));
  const requested = path.resolve(root, String(relativeFile));
  const real = fs.realpathSync(requested);
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error("Path escapes repository root");
  }
  const content = fs.readFileSync(real, "utf8").split("\n");
  const focusLine = Math.min(Math.max(1, Number(line) || 1), content.length);
  const startLine = Math.max(1, focusLine - CONTEXT_LINES);
  const endLine = Math.min(content.length, focusLine + CONTEXT_LINES);
  return { file: String(relativeFile), focusLine, startLine, lines: content.slice(startLine - 1, endLine) };
}
