import { createScanContext } from "./context.js";
import { selectBackend } from "./treesitter.js";
import { createObservationCache } from "./cache.js";
import { resolveExtractors } from "./extractor-registry.js";

async function extractFileAll(repoPath, file, ctx, extractorFns, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const observations = [];
  for (const { extract } of extractorFns) {
    observations.push(...await extract(repoPath, [file], ctx));
  }

  await cache.set(file, content, observations);
  return observations;
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

const cache = createObservationCache({ ...cacheConfig, enabled: cacheConfig.enabled !== false });

const observations = [];
for (const file of files) {
  observations.push(...await extractFileAll(repoPath, file, ctx, activeExtractorFns, cache));
}

parentPort.postMessage({ observations });
