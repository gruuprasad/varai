import { cpus } from "node:os";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";

const workerPath = fileURLToPath(new URL("worker.js", import.meta.url));

export function createWorkerPool({ concurrency, repoPath, files, stacks, prefixMap, cacheConfig, extractorIds, parser }) {
  const N = Math.max(1, concurrency ?? Math.max(1, cpus().length - 2));
  const shards = shardFiles(files, N);

  return {
    async run() {
      let results = [];
      let errors = [];

      const pending = shards.map((shard, i) => {
        return runShard({ id: i, files: shard, repoPath, stacks, prefixMap, cacheConfig, extractorIds, parser })
          .then((observations) => { results.push({ id: i, observations }); })
          .catch((err) => { errors.push({ id: i, err, files: shard }); });
      });

      await Promise.all(pending);

      const serialFallback = [];
      for (const err of errors) {
        process.stderr.write(`varai: worker ${err.id} failed, retrying serially\n`);
        try {
          const observations = await runShardSerial({
            files: err.files, repoPath, stacks, prefixMap, cacheConfig, extractorIds, parser
          });
          results.push({ id: err.id, observations });
        } catch (inner) {
          process.stderr.write(`varai: serial fallback for shard ${err.id} failed: ${inner.message}\n`);
          serialFallback.push(err.files);
        }
      }

      const byId = new Map(results.map((r) => [r.id, r.observations]));
      const observations = [];
      for (let i = 0; i < shards.length; i++) {
        if (byId.has(i)) observations.push(...byId.get(i));
      }

      return observations;
    }
  };
}

function shardFiles(files, N) {
  const shards = Array.from({ length: N }, () => []);
  for (let i = 0; i < files.length; i++) {
    shards[i % N].push(files[i]);
  }
  return shards.filter((s) => s.length > 0);
}

function runShard({ id, files, repoPath, stacks, prefixMap, cacheConfig, extractorIds, parser }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const prefixEntries = prefixMap ? [...prefixMap.entries()] : null;

    const worker = new Worker(workerPath, {
      workerData: {
        repoPath,
        files,
        stacks,
        prefixEntries,
        cacheConfig,
        extractorIds,
        parser,
      },
      type: "module",
    });

    worker.on("message", ({ observations }) => {
      settled = true;
      resolve(observations);
      void worker.terminate();
    });

    worker.on("error", (err) => {
      if (!settled) reject(err);
    });

    worker.on("exit", (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

async function runShardSerial({ files, repoPath, stacks, prefixMap, cacheConfig, extractorIds, parser }) {
  const { createScanContext } = await import("./context.js");
  const { createObservationCache } = await import("./cache.js");
  const { selectBackend } = await import("./treesitter.js");

  await selectBackend(parser ?? "native");

  const ctx = createScanContext(repoPath);
  ctx.prefixMap = prefixMap ?? null;

  const { resolveExtractors } = await import("./extractor-registry.js");
  const extractors = resolveExtractors(extractorIds);
  const cache = createObservationCache({ ...cacheConfig, enabled: cacheConfig.enabled !== false });

  const observations = [];
  for (const file of files) {
    observations.push(...await extractFileAllSerial(repoPath, file, ctx, extractors, cache));
  }

  return observations;
}

async function extractFileAllSerial(repoPath, file, ctx, extractors, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const observations = [];
  for (const { extract } of extractors) {
    observations.push(...await extract(repoPath, [file], ctx));
  }

  await cache.set(file, content, observations);
  return observations;
}
