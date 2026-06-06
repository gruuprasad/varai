import path from "node:path";
import { scanRepo } from "./scanners/index.js";
import { renderInventory } from "./reporters/inventory.js";

export async function runMap(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const include = options.include ?? [];
  const scan = await scanRepo(repoPath, { include });
  const report = renderInventory({ repoPath, scan });
  process.stdout.write(report);
  return { repoPath, scan };
}
