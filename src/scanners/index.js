import path from "node:path";
import { readdir } from "node:fs/promises";
import { detectStacks } from "./stack-detect.js";
import { extract as extractNextjs } from "./extractors/nextjs.js";
import { extract as extractFastapi } from "./extractors/fastapi.js";
import { extract as extractSqlalchemy } from "./extractors/sqlalchemy.js";
import { extract as extractReactVite } from "./extractors/react-vite.js";
import { extract as extractPythonCommon } from "./extractors/python-common.js";

const IGNORED_DIRS = new Set([
  ".git", ".next", ".varai", "build", "coverage", "dist", "node_modules",
  "__pycache__", ".venv", "venv", ".pytest_cache", ".mypy_cache"
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs", ".css", ".env", ".js", ".jsx", ".json", ".md", ".mjs",
  ".prisma", ".py", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"
]);

const EXTRACTOR_MAP = [
  ["nextjs",        extractNextjs],
  ["fastapi",       extractFastapi],
  ["sqlalchemy",    extractSqlalchemy],
  ["react-vite",    extractReactVite],
  ["python-common", extractPythonCommon]
];

export async function scanRepo(repoPath, options = {}) {
  const include = options.include ?? [];
  const files = await walk(repoPath, include);
  const stacks = await detectStacks(repoPath);

  if (stacks.size === 0) stacks.add("nextjs");

  const allFacts = [];
  for (const [stack, extractFn] of EXTRACTOR_MAP) {
    if (stacks.has(stack)) {
      allFacts.push(...await extractFn(repoPath, files));
    }
  }

  return {
    summary: { fileCount: files.length, factCount: allFacts.length },
    files,
    facts: allFacts
  };
}

async function walk(root, include = []) {
  const files = [];
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) {
        if (include.length === 0 ||
            include.some((p) => rel.startsWith(p) || p.startsWith(rel + path.sep) || p === rel)) {
          await visit(abs);
        }
      } else if (entry.isFile()) {
        if (include.length === 0 || include.some((p) => rel.startsWith(p))) {
          if (TEXT_FILE_EXTENSIONS.has(path.extname(entry.name)) || entry.name.startsWith(".env")) {
            files.push(rel);
          }
        }
      }
    }
  }
  await visit(root);
  return files.sort();
}
