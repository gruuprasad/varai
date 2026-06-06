import path from "node:path";
import { readFile } from "node:fs/promises";
import { scanRepo } from "./scanners/index.js";
import { renderInventory } from "./reporters/inventory.js";

export async function runMap(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const config = await readConfig(repoPath);
  const include = options.include?.length ? options.include : (config.include ?? []);
  const scan = await scanRepo(repoPath, { include });
  const report = renderInventory({ repoPath, scan });
  process.stdout.write(report);
  return { repoPath, scan };
}

async function readConfig(repoPath) {
  try {
    const raw = await readFile(path.join(repoPath, "varai.config.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
