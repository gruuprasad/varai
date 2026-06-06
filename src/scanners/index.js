import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { detectStacks } from "./stack-detect.js";
import { createScanContext } from "./context.js";
import { extract as extractFastapi } from "./extractors/fastapi.js";
import { extract as extractSqlalchemy } from "./extractors/sqlalchemy.js";
import { extract as extractReactVite } from "./extractors/react-vite.js";
import { extract as extractPythonCommon } from "./extractors/python-common.js";
import { extract as extractNpm } from "./extractors/npm.js";
import { buildPrefixMap } from "./router-prefix.js";

const ROOT_MARKERS = ["pyproject.toml", "package.json"];

const IGNORED_DIRS = new Set([
  ".git", ".next", ".varai", "build", "coverage", "dist", "node_modules",
  "__pycache__", ".venv", "venv", ".pytest_cache", ".mypy_cache", ".worktrees"
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs", ".css", ".env", ".js", ".jsx", ".json", ".md", ".mjs",
  ".prisma", ".py", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"
]);

const EXTRACTOR_MAP = [
  ["fastapi",       extractFastapi],
  ["sqlalchemy",    extractSqlalchemy],
  ["react-vite",    extractReactVite],
  ["python-common", extractPythonCommon],
  ["npm",           extractNpm]
];

export async function scanRepo(repoPath, options = {}) {
  const include = options.include ?? [];
  const gitignore = options.gitignore !== false;
  const files = await walk(repoPath, include, gitignore);

  for (const marker of ROOT_MARKERS) {
    if (!files.includes(marker)) {
      try {
        const s = await stat(path.join(repoPath, marker));
        if (s.isFile()) files.push(marker);
      } catch { /* doesn't exist */ }
    }
  }

  const stacks = await detectStacks(repoPath, files);

  const ctx = createScanContext(repoPath);

  if (stacks.has("fastapi")) {
    ctx.prefixMap = await buildPrefixMap(files, ctx);
  }

  const allFacts = [];
  for (const [stack, extractFn] of EXTRACTOR_MAP) {
    if (stacks.has(stack)) {
      allFacts.push(...await extractFn(repoPath, files, ctx));
    }
  }

  const sectionCounts = countByKind(allFacts);
  const summary = {
    fileCount: files.length,
    factCount: allFacts.length,
    stacks: [...stacks],
    sectionCounts
  };

  return { summary, stacks: [...stacks], files, facts: allFacts };
}

function countByKind(facts) {
  const counts = {};
  for (const f of facts) {
    counts[f.kind] = (counts[f.kind] || 0) + 1;
  }
  return counts;
}

async function walk(root, include = [], gitignore = true) {
  let ig = null;
  if (gitignore) {
    try {
      const { default: ignoreFactory } = await import("ignore");
      const { readFile } = await import("node:fs/promises");
      const gitignorePath = path.join(root, ".gitignore");
      const raw = await readFile(gitignorePath, "utf8");
      ig = ignoreFactory().add(raw);
    } catch { /* no .gitignore or ignore package unavailable */ }
  }

  const files = [];
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);

      if (ig) {
        const isDir = entry.isDirectory();
        if (ig.ignores(rel + (isDir ? "/" : ""))) continue;
      }

      if (entry.isDirectory()) {
        if (include.length === 0 ||
            include.some((p) => rel.startsWith(p) || p.startsWith(rel + path.sep) || p === rel)) {
          await visit(abs);
        }
      } else if (entry.isFile()) {
        if (include.length === 0 || include.some((p) => rel.startsWith(p))) {
          const ext = path.extname(entry.name);
          if (TEXT_FILE_EXTENSIONS.has(ext) || entry.name.startsWith(".env")) {
            files.push(rel);
          }
        }
      }
    }
  }
  await visit(root);
  return files.sort();
}
