import { cpus } from "node:os";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";

const workerPath = fileURLToPath(new URL("worker.js", import.meta.url));

export function createWorkerPool({ concurrency, repoPath, files, stacks, prefixMap, cacheConfig, extractorNames, parser }) {
  const N = Math.max(1, concurrency ?? Math.max(1, cpus().length - 2));
  const shards = shardFiles(files, N);

  return {
    async run() {
      let results = [];
      let errors = [];

      const pending = shards.map((shard, i) => {
        return runShard({ id: i, files: shard, repoPath, stacks, prefixMap, cacheConfig, extractorNames, parser })
          .then((facts) => { results.push({ id: i, facts }); })
          .catch((err) => { errors.push({ id: i, err, files: shard }); });
      });

      await Promise.all(pending);

      const serialFallback = [];
      for (const err of errors) {
        process.stderr.write(`varai: worker ${err.id} failed, retrying serially\n`);
        try {
          const facts = await runShardSerial({
            files: err.files, repoPath, stacks, prefixMap, cacheConfig, extractorNames, parser
          });
          results.push({ id: err.id, facts });
        } catch (inner) {
          process.stderr.write(`varai: serial fallback for shard ${err.id} failed: ${inner.message}\n`);
          serialFallback.push(err.files);
        }
      }

      const byId = new Map(results.map((r) => [r.id, r.facts]));
      const allFacts = [];
      for (let i = 0; i < shards.length; i++) {
        if (byId.has(i)) allFacts.push(...byId.get(i));
      }

      return allFacts;
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

function runShard({ id, files, repoPath, stacks, prefixMap, cacheConfig, extractorNames, parser }) {
  return new Promise((resolve, reject) => {
    const prefixEntries = prefixMap ? [...prefixMap.entries()] : null;

    const worker = new Worker(workerPath, {
      workerData: {
        repoPath,
        files,
        stacks,
        prefixEntries,
        cacheConfig,
        extractorNames,
        parser,
      },
      type: "module",
    });

    worker.on("message", ({ facts }) => {
      resolve(facts);
    });

    worker.on("error", (err) => {
      reject(err);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

async function runShardSerial({ files, repoPath, stacks, prefixMap, cacheConfig, extractorNames, parser }) {
  const { createScanContext } = await import("./context.js");
  const { createFactCache } = await import("./cache.js");
  const { selectBackend } = await import("./treesitter.js");

  await selectBackend(parser ?? "native");

  const ctx = createScanContext(repoPath);
  ctx.prefixMap = prefixMap ?? null;

  const extractors = await loadExtractors();
  const cache = createFactCache({ ...cacheConfig, enabled: cacheConfig.enabled !== false });

  const facts = [];
  for (const file of files) {
    facts.push(...await extractFileAllSerial(repoPath, file, ctx, extractorNames, extractors, cache));
  }

  return facts;
}

async function loadExtractors() {
  const { extract: extractFastapi } = await import("./extractors/fastapi.js");
  const { extract: extractSqlalchemy } = await import("./extractors/sqlalchemy.js");
  const { extract: extractReactVite } = await import("./extractors/react-vite.js");
  const { extract: extractPythonCommon } = await import("./extractors/python-common.js");
  const { extract: extractNpm } = await import("./extractors/npm.js");
  return { extractFastapi, extractSqlalchemy, extractReactVite, extractPythonCommon, extractNpm };
}

async function extractFileAllSerial(repoPath, file, ctx, extractorNames, extractors, cache) {
  const content = await ctx.read(file);
  if (!content) return [];

  const cached = await cache.get(file, content);
  if (cached) return cached;

  const map = {
    "fastapi": extractors.extractFastapi,
    "sqlalchemy": extractors.extractSqlalchemy,
    "react-vite": extractors.extractReactVite,
    "python-common": extractors.extractPythonCommon,
    "npm": extractors.extractNpm,
  };

  const facts = [];
  for (const name of extractorNames) {
    const fn = map[name];
    if (fn) facts.push(...await fn(repoPath, [file], ctx));
  }

  await cache.set(file, content, facts);
  return facts;
}
