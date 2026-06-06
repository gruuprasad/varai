import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { queryCaptures } from "../treesitter.js";

const ROUTE_RE = /^@(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']+)["']/i;

export async function extract(repoPath, files) {
  const facts = [];
  for (const file of files) {
    if (path.extname(file) !== ".py") continue;
    let content;
    try {
      const s = await stat(path.join(repoPath, file));
      if (s.size > 500_000) continue;
      content = await readFile(path.join(repoPath, file), "utf8");
    } catch { continue; }

    for (const { node } of await queryCaptures("python", content, "(decorator) @dec")) {
      const m = node.text.match(ROUTE_RE);
      if (!m) continue;
      const method = m[1].toUpperCase();
      const routePath = m[2];
      const name = `${method} ${routePath}`;
      const line = node.startPosition.row + 1;
      facts.push({ kind: "api_route", name, evidence: [{ file, line }], layer: "ast" });
      if (/webhook/i.test(routePath)) {
        facts.push({ kind: "webhook_route", name, evidence: [{ file, line }], layer: "ast" });
      }
    }
  }
  return facts;
}
