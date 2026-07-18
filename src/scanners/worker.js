import { createScanContext } from "./context.js";
import { selectBackend } from "./treesitter.js";
import { createFactCache } from "./cache.js";
import { resolveExtractors } from "./extractor-registry.js";

async function extractFileAll(repoPath, file, ctx, extractorFns, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const facts = [];
  for (const { extract } of extractorFns) {
    facts.push(...await extract(repoPath, [file], ctx));
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
  extractorIds,
  parser,
} = workerData;

await selectBackend(parser ?? "native");

const ctx = createScanContext(repoPath);
ctx.prefixMap = prefixEntries ? new Map(prefixEntries) : null;

const activeExtractorFns = resolveExtractors(extractorIds);

const cache = createFactCache({ ...cacheConfig, enabled: cacheConfig.enabled !== false });

const allFacts = [];
for (const file of files) {
  allFacts.push(...await extractFileAll(repoPath, file, ctx, activeExtractorFns, cache));
}

parentPort.postMessage({ facts: allFacts });
