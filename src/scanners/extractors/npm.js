import path from "node:path";
import { createScanContext } from "../context.js";

const NPM_MANIFESTS = ["package.json", "services/frontend/package.json"];

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    if (!NPM_MANIFESTS.includes(file) && !file.endsWith("/package.json")) continue;
    const content = await ctx.read(file);
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      for (const name of Object.keys(deps)) {
        facts.push({
          kind: "package", name, ecosystem: "npm",
          evidence: [{ file }], layer: "ast"
        });
      }
    } catch { /* bad JSON */ }
  }
  return facts;
}
