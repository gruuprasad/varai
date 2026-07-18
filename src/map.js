import path from "node:path";
import { scanRepo } from "./scanners/index.js";
import { renderSystemModel } from "./reporters/system-model-markdown.js";
import { loadRepoConfig } from "./scanners/config.js";

export async function runMap(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const config = await loadRepoConfig(repoPath);
  const include = options.include?.length ? options.include : (config.include ?? []);
  const scanOptions = { include, config };
  if (options.cache !== undefined) scanOptions.cache = options.cache;
  if (options.cacheDir !== undefined) scanOptions.cacheDir = options.cacheDir;
  if (options.jobs !== undefined) scanOptions.jobs = options.jobs;
  if (options.parser !== undefined) scanOptions.parser = options.parser;
  const scan = await scanRepo(repoPath, scanOptions);
  const report = renderSystemModel({ model: scan.systemModel });
  process.stdout.write(report);
  return { repoPath, scan };
}
