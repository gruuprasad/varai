import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { detectStacks } from "./stack-detect.js";
import { createScanContext } from "./context.js";
import { extract as extractFastapi } from "./extractors/fastapi.js";
import { extract as extractSqlalchemy } from "./extractors/sqlalchemy.js";
import { extract as extractReactVite } from "./extractors/react-vite.js";
import { extract as extractPythonCommon } from "./extractors/python-common.js";
import { extract as extractNpm } from "./extractors/npm.js";
import { buildPrefixMap } from "./router-prefix.js";
import { dedupeFacts } from "./utils.js";
import { createFactCache } from "./cache.js";
import { selectBackend } from "./treesitter.js";

const ROOT_MARKERS = ["pyproject.toml", "package.json", "services/frontend/package.json"];

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

const KIND_RANK = new Map([
  ["api_route",          1],
  ["webhook_route",      2],
  ["page",               3],
  ["db_model",           4],
  ["database_migration", 5],
  ["state_store",        6],
  ["api_call",           7],
  ["component",          8],
  ["hook",               9],
  ["settings_field",    10],
  ["package",           11],
  ["env_var",           12],
]);

// The worker pool exists to amortize slow WASM parsing across cores. The native
// backend parses several times faster, so spawning workers costs more (spawn +
// per-worker re-init) than it saves. Gate auto-enable to the wasm backend on
// large repos only; an explicit --jobs N>1 still forces the pool on regardless.
const POOL_MIN_FILES = 1500;

export async function scanRepo(repoPath, options = {}) {
  const include = options.include ?? [];
  const gitignore = options.gitignore !== false;
  const useCache = options.cache !== false;
  const cacheDirOverride = options.cacheDir ?? null;
  const jobsExplicit = options.jobs !== undefined;
  const jobs = options.jobs ?? Math.max(1, cpus().length - 2);
  const parser = options.parser ?? process.env.VARAI_PARSER ?? "native";

  await selectBackend(parser);

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

  let prefixMap = null;
  let prefixFingerprint = "";
  if (stacks.has("fastapi")) {
    prefixMap = await buildPrefixMap(files, ctx);
    ctx.prefixMap = prefixMap;
    const sorted = [...prefixMap.entries()].map(([k, v]) => `${k}:${v}`).sort();
    prefixFingerprint = createHash("sha256").update(sorted.join("\n")).digest("hex");
  }

  const cacheDir = cacheDirOverride ?? path.join(repoPath, ".varai", "cache");
  const { EXTRACTOR_VERSION } = await import("./cache.js");
  const cacheConfig = {
    cacheDir,
    extractorVersion: EXTRACTOR_VERSION,
    stacks: [...stacks],
    prefixFingerprint,
    enabled: useCache,
  };
  const cache = createFactCache(cacheConfig);

  const activeExtractors = EXTRACTOR_MAP.filter(([stack]) => stacks.has(stack));
  const extractorNames = activeExtractors.map(([name]) => name);

  // Auto-enable only for wasm on large repos; an explicit --jobs N>1 forces it on.
  const usePool = jobs > 1 &&
    (jobsExplicit || (parser === "wasm" && files.length >= POOL_MIN_FILES));

  let allFacts;
  if (usePool) {
    const { createWorkerPool } = await import("./pool.js");
    const pool = createWorkerPool({
      concurrency: jobs,
      repoPath,
      files,
      stacks: [...stacks],
      prefixMap,
      cacheConfig,
      extractorNames,
      parser,
    });
    allFacts = await pool.run();
  } else {
    allFacts = [];
    for (const file of files) {
      allFacts.push(...await extractFileAll(repoPath, file, ctx, activeExtractors, cache));
    }
  }

  const sortedFacts = sortFacts(allFacts);
  const dedupedFacts = dedupeFacts(sortedFacts);

  const sectionCounts = countByKind(dedupedFacts);
  const summary = {
    fileCount: files.length,
    factCount: dedupedFacts.length,
    stacks: [...stacks],
    sectionCounts
  };

  return { summary, stacks: [...stacks], files, facts: dedupedFacts };
}

async function extractFileAll(repoPath, file, ctx, activeExtractors, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const facts = [];
  for (const [, extractFn] of activeExtractors) {
    facts.push(...await extractFn(repoPath, [file], ctx));
  }

  await cache.set(file, content, facts);
  return facts;
}

function sortFacts(facts) {
  return [...facts].sort((a, b) => {
    const ra = KIND_RANK.get(a.kind) ?? 99;
    const rb = KIND_RANK.get(b.kind) ?? 99;
    if (ra !== rb) return ra - rb;
    const fa = (a.evidence?.[0]?.file) ?? "";
    const fb = (b.evidence?.[0]?.file) ?? "";
    if (fa !== fb) return fa < fb ? -1 : 1;
    const la = a.evidence?.[0]?.line ?? 0;
    const lb = b.evidence?.[0]?.line ?? 0;
    if (la !== lb) return la - lb;
    const na = a.name ?? "";
    const nb = b.name ?? "";
    return na < nb ? -1 : 1;
  });
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
