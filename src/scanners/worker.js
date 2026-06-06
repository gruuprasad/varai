import { createScanContext } from "./context.js";
import { selectBackend } from "./treesitter.js";

let extractors = null;

async function loadExtractors() {
  if (extractors) return extractors;
  const { extract: extractFastapi } = await import("./extractors/fastapi.js");
  const { extract: extractSqlalchemy } = await import("./extractors/sqlalchemy.js");
  const { extract: extractReactVite } = await import("./extractors/react-vite.js");
  const { extract: extractPythonCommon } = await import("./extractors/python-common.js");
  const { extract: extractNpm } = await import("./extractors/npm.js");
  const { createFactCache } = await import("./cache.js");
  extractors = { extractFastapi, extractSqlalchemy, extractReactVite, extractPythonCommon, extractNpm, createFactCache };
  return extractors;
}

async function extractFileAll(repoPath, file, ctx, activeExtractorNames, extractorFns, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const facts = [];
  for (const fn of extractorFns) {
    facts.push(...await fn(repoPath, [file], ctx));
  }

  await cache.set(file, content, facts);
  return facts;
}

const { parentPort, workerData } = await import("node:worker_threads");

const {
  repoPath,
  files,
  stacks,
  prefixEntries,
  cacheConfig,
  extractorNames,
  parser,
} = workerData;

await selectBackend(parser ?? "native");

const ctx = createScanContext(repoPath);
ctx.prefixMap = prefixEntries ? new Map(prefixEntries) : null;

const { extractFastapi, extractSqlalchemy, extractReactVite, extractPythonCommon, extractNpm, createFactCache } = await loadExtractors();

const nameToFn = {
  "fastapi": extractFastapi,
  "sqlalchemy": extractSqlalchemy,
  "react-vite": extractReactVite,
  "python-common": extractPythonCommon,
  "npm": extractNpm,
};

const activeExtractorFns = extractorNames.map((n) => nameToFn[n]).filter(Boolean);

const cache = createFactCache({ ...cacheConfig, enabled: cacheConfig.enabled !== false });

const allFacts = [];
for (const file of files) {
  allFacts.push(...await extractFileAll(repoPath, file, ctx, extractorNames, activeExtractorFns, cache));
}

parentPort.postMessage({ facts: allFacts });
