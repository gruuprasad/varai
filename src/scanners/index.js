import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { detectStacks } from "./stack-detect.js";
import { createScanContext } from "./context.js";
import { extractorFingerprint, selectExtractors } from "./extractor-registry.js";
import { buildPrefixMap } from "./router-prefix.js";
import { dedupeObservations } from "./utils.js";
import { createObservationCache } from "./cache.js";
import { selectBackend } from "./treesitter.js";
import { traceBehaviors } from "./behaviors/index.js";
import { traceFrontendInteractions } from "./frontend/interactions.js";
import { traceScreenContainment } from "./frontend/render-graph.js";
import { createResolver } from "./behaviors/resolver.js";
import { createImplementationGraph } from "./lift/implementation-graph.js";
import { createDeclarationRegistry } from "./lift/declarations.js";
import { bindBehaviorReferents } from "./lift/bindings.js";
import { liftSystemModel } from "./lift/index.js";
import { collectPythonImports } from "./imports/python-imports.js";

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
  const exclude = options.exclude ?? [];
  const gitignore = options.gitignore !== false;
  const useCache = options.cache !== false;
  const cacheDirOverride = options.cacheDir ?? null;
  const jobsExplicit = options.jobs !== undefined;
  const jobs = options.jobs ?? Math.max(1, cpus().length - 2);
  const parser = options.parser ?? process.env.VARAI_PARSER ?? "native";

  await selectBackend(parser);

  const files = await walk(repoPath, include, exclude, gitignore);

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
  const cache = createObservationCache(cacheConfig);

  // Auto-enable only for wasm on large repos; an explicit --jobs N>1 forces it on.
  const usePool = jobs > 1 &&
    (jobsExplicit || (parser === "wasm" && files.length >= POOL_MIN_FILES));

  let extractedObservations;
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
    extractedObservations = await pool.run();
  } else {
    extractedObservations = [];
    for (const file of files) {
      extractedObservations.push(...await extractFileAll(repoPath, file, ctx, activeExtractors, cache));
    }
  }

  // Observations are private analyzer input. Only the canonical System Model
  // crosses the scanner interface.
  const observations = dedupeObservations(sortObservations(extractedObservations));

  const diagnostics = [];
  const graph = createImplementationGraph();
  const resolver = createResolver(files, ctx, { workBudget: 100_000 });
  let apiBehaviors = [];
  let frontendBehaviors = [];
  if (stacks.has("fastapi") || stacks.has("nextjs")) {
    try {
      apiBehaviors = await traceBehaviors(repoPath, files, ctx, observations, { graph, resolver });
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
  let screenContainment = [];
  if (stacks.has("react-vite")) {
    try {
      const surfaces = frontendBehaviors
        .filter((behavior) => behavior.door?.kind === "ui_action")
        .map((behavior) => ({ component: String(behavior.door.component), file: behavior.door.source }));
      screenContainment = await traceScreenContainment(
        files, ctx, observations.filter((item) => item.kind === "page"), surfaces);
    } catch (err) {
      diagnostics.push({
        code: "screen-containment-failed", severity: "warning", message: err.message,
        claimState: "unverified", capability: "ui.containment",
      });
    }
  }

  // "base" is an internal always-on stack; don't surface it to the report.
  const displayStacks = [...stacks].filter((s) => s !== "base");

  const behaviors = [...apiBehaviors, ...frontendBehaviors];
  const importEdges = await collectPythonImports(files, ctx);
  const registry = await createDeclarationRegistry({ observations, symbolIndex: resolver });
  const bindings = bindBehaviorReferents(behaviors, registry);
  diagnostics.push(...bindings.diagnostics, ...graph.diagnostics());
  const untracedGroups = new Map();
  for (const behavior of behaviors) {
    for (const clause of behavior.untraced ?? []) {
      const capability = behavior.door?.kind === "ui_action" ? "ui.action" : "api.effect";
      const reason = clause.reason ?? "unsupported call";
      const key = `${capability}\0${reason}`;
      const group = untracedGroups.get(key) ?? { capability, reason, calls: new Set(), evidence: [] };
      group.calls.add(clause.call ?? "call");
      group.evidence.push(...[clause.evidence].flat().filter(Boolean));
      untracedGroups.set(key, group);
    }
  }
  for (const group of untracedGroups.values()) {
    const calls = [...group.calls].sort();
    const examples = calls.slice(0, 12).join(", ");
    diagnostics.push({
      code: "untraced-call",
      severity: "warning",
      message: `Could not trace ${calls.length} distinct calls (${group.reason})${examples ? `: ${examples}${calls.length > 12 ? ", …" : ""}` : ""}`,
      claimState: "unverified",
      capability: group.capability,
      evidence: group.evidence,
    });
  }
  if (resolver.stats().exhausted) diagnostics.push({
    code: "symbol-resolution-budget-exhausted",
    severity: "warning",
    message: "Symbol-resolution work budget was exhausted",
    claimState: "unverified",
    capability: "implementation.trace",
    evidence: [],
  });
  const scanContext = {
      activeExtractorIds: extractorIds,
      include: [...include].sort(),
      exclude: [...exclude].sort(),
      stacks: displayStacks,
  };
  const model = liftSystemModel({
    observations,
    behaviors: bindings.behaviors,
    registry,
    convergence: bindings.convergence,
    containment: screenContainment,
    diagnostics,
    importEdges,
    scanContext,
  }, { repoPath, systemName: options.systemName });
  const summary = {
    fileCount: files.length,
    elementCount: model.elements.length,
    claimCount: model.claims.length,
    stacks: displayStacks,
  };
  return { summary, stacks: displayStacks, files, model };
}

async function extractFileAll(repoPath, file, ctx, activeExtractors, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const observations = [];
  for (const { extract } of activeExtractors) {
    observations.push(...await extract(repoPath, [file], ctx));
  }

  await cache.set(file, content, observations);
  return observations;
}

function sortObservations(observations) {
  return [...observations].sort((a, b) => {
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

async function walk(root, include = [], exclude = [], gitignore = true) {
  const normalizedInclude = include.map((value) => path.normalize(value));
  const normalizedExclude = exclude.map((value) => path.normalize(value));
  const isExcluded = (value) => normalizedExclude.some((prefix) => value === prefix || value.startsWith(prefix + path.sep));
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
      if (isExcluded(rel)) continue;

      if (ig) {
        const isDir = entry.isDirectory();
        if (ig.ignores(rel + (isDir ? "/" : ""))) continue;
      }

      if (entry.isDirectory()) {
        if (normalizedInclude.length === 0 ||
            normalizedInclude.some((p) => rel.startsWith(p) || p.startsWith(rel + path.sep) || p === rel)) {
          await visit(abs);
        }
      } else if (entry.isFile()) {
        if (normalizedInclude.length === 0 || normalizedInclude.some((p) => rel.startsWith(p))) {
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
