import path from "node:path";
import { createScanContext } from "../context.js";
import { queryTree } from "../treesitter.js";

// Named routers (@api_content.get, @auth_router.post) plus @app / @router.
// Empty path "" is allowed for include_router-mounted roots.
const ROUTE_RE = /^@(\w+)\.(get|post|put|patch|delete|head|options)\s*\(\s*["']([^"']*)["']/i;
const ROUTE_HINT_RE = /@\w+\.(get|post|put|patch|delete|head|options)\s*\(/i;

// Receivers that share HTTP-verb method names but are never FastAPI route tables.
const NON_ROUTE_RECEIVERS = new Set([
  "mock", "patch", "magicmock", "responses", "requests_mock", "httpretty",
  "cache", "limiter", "self", "pytest", "unittest", "aioresponses",
]);

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    if (path.extname(file) !== ".py") continue;
    const content = await ctx.read(file);
    if (!content) continue;
    if (!ROUTE_HINT_RE.test(content)) continue;

    const tree = await ctx.tree(file, "python");
    if (!tree) continue;

    for (const { node } of await queryTree(tree, "python", "(decorator) @dec")) {
      const m = node.text.match(ROUTE_RE);
      if (!m) continue;
      const receiver = m[1];
      const method = m[2].toUpperCase();
      const routePath = m[3];
      if (!isRouteDecorator(receiver, routePath)) continue;

      const displayPath = routePath === "" ? "/" : routePath;
      let name = `${method} ${displayPath}`;
      let layer = "ast";

      if (ctx.prefixMap) {
        const resolved = resolvePrefix(ctx.prefixMap, file);
        if (resolved !== null) {
          name = `${method} ${resolved}${routePath === "/" || routePath === "" ? "" : routePath}`;
          layer = "semantic";
        }
      }

      const line = node.startPosition.row + 1;
      facts.push({ kind: "api_route", name, evidence: [{ file, line }], layer });
    }
  }
  return facts;
}

export function isRouteDecorator(receiver, routePath) {
  if (NON_ROUTE_RECEIVERS.has(String(receiver ?? "").toLowerCase())) return false;
  // Route paths are URL paths (including mounted roots with ""). Reject
  // mock targets, absolute URLs, and bare cache keys.
  return routePath === "" || routePath.startsWith("/");
}

function resolvePrefix(prefixMap, file) {
  let prefix = prefixMap.get(file);
  if (prefix === undefined) return null;
  if (prefix === "") return null;
  return prefix;
}
