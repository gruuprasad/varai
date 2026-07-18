import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { detectStacks } from "./stack-detect.js";
import { createScanContext } from "./context.js";
import { extractorFingerprint, selectExtractors } from "./extractor-registry.js";
import { deriveIntegrations } from "./extractors/integration.js";
import { tagStock } from "./extractors/stock-tagger.js";
import { buildPrefixMap } from "./router-prefix.js";
import { dedupeFacts } from "./utils.js";
import { createFactCache } from "./cache.js";
import { selectBackend } from "./treesitter.js";
import { traceBehaviors } from "./behaviors/index.js";
import { traceFrontendInteractions } from "./frontend/interactions.js";
import { createAnalysisIR } from "../ir/canonicalize.js";
import { validateAnalysisIR } from "../ir/validate.js";
import { behaviorIdentity, stableId } from "../ir/identity.js";
import { projectAnalysisV2 } from "../system-model/projectors/analysis-v2.js";

// ROOT_MARKERS are always included in the file list even when an --include
// filter is active — they describe the whole project, not one service subdir.
const ROOT_MARKERS = [
  "pyproject.toml", "package.json", "services/frontend/package.json",
  "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml",
  "Makefile",
];

const IGNORED_DIRS = new Set([
  ".git", ".next", ".varai", "build", "coverage", "dist", "node_modules",
  "__pycache__", ".venv", "venv", ".pytest_cache", ".mypy_cache", ".worktrees"
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs", ".css", ".env", ".js", ".jsx", ".json", ".md", ".mjs",
  ".prisma", ".py", ".sql", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"
]);

// Extensionless or special-name files worth scanning (runnable artifacts).
function isInterestingName(name) {
  return name === "Makefile" ||
    name === "Dockerfile" ||
    name.startsWith("Dockerfile.") ||
    name.startsWith(".env");
}

const KIND_RANK = new Map([
  ["integration",        1],
  ["service",            2],
  ["script",             3],
  ["api_route",          4],
  ["webhook_route",      5],
  ["page",               6],
  ["db_model",           7],
  ["schema",             8],
  ["database_migration", 9],
  ["state_store",       10],
  ["api_call",          11],
  ["component",         12],
  ["hook",              13],
  ["settings_field",    14],
  ["package",           15],
  ["env_var",           16],
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
  const activeExtractors = selectExtractors(stacks);
  const extractorIds = activeExtractors.map(({ id }) => id);
  const cacheConfig = {
    cacheDir,
    extractorVersion: EXTRACTOR_VERSION,
    stacks: [...stacks],
    prefixFingerprint,
    extractorFingerprint: extractorFingerprint(activeExtractors),
    enabled: useCache,
  };
  const cache = createFactCache(cacheConfig);

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
      extractorIds,
      parser,
    });
    allFacts = await pool.run();
  } else {
    allFacts = [];
    for (const file of files) {
      allFacts.push(...await extractFileAll(repoPath, file, ctx, activeExtractors, cache));
    }
  }

  const dedupedFacts = dedupeFacts(sortFacts(allFacts));

  // Derive cross-cutting facts from the merged set (integrations are inferred
  // from package/env_var facts, not from any single file), then re-sort so they
  // group correctly. Derived facts are deterministic, so this stays stable.
  const derivedFacts = deriveIntegrations(dedupedFacts);
  const merged = [...dedupedFacts, ...derivedFacts];
  const stock = tagStock(merged, options.config ?? {});
  const finalFacts = sortFacts(merged);

  const diagnostics = [];
  let behaviors = { bundles: [] };
  let frontendBehaviors = [];
  if (stacks.has("fastapi")) {
    try {
      const traced = await traceBehaviors(repoPath, files, ctx, finalFacts);
      behaviors = { bundles: traced.bundles };
    } catch (err) {
      diagnostics.push({
        code: "behavior-trace-failed",
        severity: "error",
        message: err.message,
        claimState: "unverified",
      });
    }
  }
  if (stacks.has("react-vite")) {
    try {
      frontendBehaviors = await traceFrontendInteractions(files, ctx);
    } catch (err) {
      diagnostics.push({
        code: "frontend-behavior-trace-failed",
        severity: "error",
        message: err.message,
        claimState: "unverified",
      });
    }
  }

  // "base" is an internal always-on stack; don't surface it to the report.
  const displayStacks = [...stacks].filter((s) => s !== "base");

  const sectionCounts = countByKind(finalFacts);
  const summary = {
    fileCount: files.length,
    factCount: finalFacts.length,
    stacks: displayStacks,
    sectionCounts
  };

  const flatBehaviors = [...behaviors.bundles.flatMap((bundle) => bundle.behaviors), ...frontendBehaviors];
  const patternInstances = [...stock.instances.entries()].map(([name, members]) => ({
    id: stableId("pattern", name),
    name,
    members: members.map(({ fact, role }) => ({
      factId: stableId("fact", factIdentityForScan(fact)),
      role,
    })).sort((a, b) => `${a.factId}:${a.role}`.localeCompare(`${b.factId}:${b.role}`)),
  }));
  const analysis = validateAnalysisIR(createAnalysisIR({
    scanContext: {
      activeExtractorIds: extractorIds,
      include: [...include].sort(),
      stacks: displayStacks,
    },
    facts: finalFacts,
    patternInstances,
    behaviors: flatBehaviors,
    bundleViews: behaviors.bundles.map((bundle) => ({
      ...bundle,
      behaviors: bundle.behaviors.map((behavior) => stableId("behavior", behaviorIdentity(behavior))),
    })),
    diagnostics,
  }));
  const systemModel = projectAnalysisV2(analysis, { repoPath });
  return { summary, stacks: displayStacks, files, facts: finalFacts, behaviors: { ...behaviors, frontend: frontendBehaviors }, diagnostics, analysis, systemModel };
}

function factIdentityForScan(fact) {
  if (["api_route", "webhook_route"].includes(fact.kind)) return [fact.kind, fact.name];
  if (["env_var", "integration", "package", "script", "service"].includes(fact.kind)) return [fact.kind, fact.ecosystem ?? "", fact.name];
  return [fact.kind, fact.evidence?.[0]?.file ?? "", fact.name];
}

async function extractFileAll(repoPath, file, ctx, activeExtractors, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const facts = [];
  for (const { extract } of activeExtractors) {
    facts.push(...await extract(repoPath, [file], ctx));
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
          if (TEXT_FILE_EXTENSIONS.has(ext) || isInterestingName(entry.name)) {
            files.push(rel);
          }
        }
      }
    }
  }
  await visit(root);
  return files.sort();
}
