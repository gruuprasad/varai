import path from "node:path";
import { createScanContext } from "../context.js";
import { queryTree } from "../treesitter.js";

const ROUTE_RE = /^@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']+)["']/i;

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    if (path.extname(file) !== ".py") continue;
    const content = await ctx.read(file);
    if (!content) continue;
    if (!content.includes("@app.") && !content.includes("@router.")) continue;

    const tree = await ctx.tree(file, "python");
    if (!tree) continue;

    for (const { node } of await queryTree(tree, "python", "(decorator) @dec")) {
      const m = node.text.match(ROUTE_RE);
      if (!m) continue;
      const method = m[1].toUpperCase();
      const routePath = m[2];
      let name = `${method} ${routePath}`;
      let layer = "ast";

      if (ctx.prefixMap) {
        const resolved = resolvePrefix(ctx.prefixMap, file);
        if (resolved !== null) {
          name = `${method} ${resolved}${routePath === "/" ? "" : routePath}`;
          layer = "semantic";
        }
      }

      const line = node.startPosition.row + 1;
      facts.push({ kind: "api_route", name, evidence: [{ file, line }], layer });
    }
  }
  return facts;
}

function resolvePrefix(prefixMap, file) {
  let prefix = prefixMap.get(file);
  if (prefix === undefined) return null;
  if (prefix === "") return null;
  return prefix;
}
