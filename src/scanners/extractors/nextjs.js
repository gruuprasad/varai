const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const APP_ROUTE_RE = /(?:^|\/)app\/(.+)\/route\.[jt]sx?$/i;
const PAGES_API_RE = /(?:^|\/)pages\/api\/(.+)\.[jt]sx?$/i;
// Direct exports only (`export async function GET` / `export const POST`).
// Re-exports such as `export { GET } from "./handlers"` are intentionally not
// recovered yet — Next apps that only re-export handlers remain a known blind spot.
const APP_EXPORT_RE = /\bexport\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
const PAGES_METHOD_RE = /\breq\.method\s*===?\s*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']/gi;
const PAGES_CASE_RE = /\bcase\s+["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']\s*:/gi;

export async function extract(repoPath, files, ctx) {
  const facts = [];
  for (const file of files) {
    const routePath = routePathFromFile(file);
    if (!routePath) continue;
    const content = await ctx.read(file);
    if (!content) continue;

    const methods = methodsForFile(file, content);
    for (const method of methods) {
      facts.push({
        kind: "api_route",
        name: `${method} ${routePath}`,
        evidence: [{ file, line: methodLine(content, method, file) }],
        layer: "ast",
      });
    }
  }
  return facts;
}

export function routePathFromFile(file) {
  const normalized = file.replaceAll("\\", "/");
  const app = normalized.match(APP_ROUTE_RE);
  if (app) return segmentsToPath(app[1].split("/").filter((seg) => !isRouteGroup(seg)));

  const pages = normalized.match(PAGES_API_RE);
  if (!pages) return null;
  let rest = pages[1];
  if (rest.endsWith("/index")) rest = rest.slice(0, -"/index".length);
  return segmentsToPath(["api", ...rest.split("/")]);
}

function segmentsToPath(segments) {
  const parts = segments.map((seg) => {
    if (seg.startsWith("[[...") || seg.startsWith("[...")) return "*";
    if (seg.startsWith("[") && seg.endsWith("]")) return "*";
    return seg;
  });
  return `/${parts.filter(Boolean).join("/")}`;
}

function isRouteGroup(seg) {
  return /^\([^)]+\)$/.test(seg);
}

function methodsForFile(file, content) {
  const normalized = file.replaceAll("\\", "/");
  if (APP_ROUTE_RE.test(normalized)) {
    return uniqueMethods([...content.matchAll(APP_EXPORT_RE)].map((m) => m[1].toUpperCase()));
  }
  const fromEquals = [...content.matchAll(PAGES_METHOD_RE)].map((m) => m[1].toUpperCase());
  const fromCase = [...content.matchAll(PAGES_CASE_RE)].map((m) => m[1].toUpperCase());
  const found = uniqueMethods([...fromEquals, ...fromCase]);
  // Pages handlers often branch on method; if none are visible, do not invent routes.
  return found;
}

function uniqueMethods(methods) {
  return HTTP_METHODS.filter((method) => methods.includes(method));
}

function methodLine(content, method, file) {
  const normalized = file.replaceAll("\\", "/");
  const patterns = APP_ROUTE_RE.test(normalized)
    ? [
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
      new RegExp(`export\\s+const\\s+${method}\\b`),
    ]
    : [
      new RegExp(`req\\.method\\s*===?\\s*["']${method}["']`, "i"),
      new RegExp(`case\\s+["']${method}["']\\s*:`, "i"),
    ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.index != null) return content.slice(0, match.index).split("\n").length;
  }
  return 1;
}
