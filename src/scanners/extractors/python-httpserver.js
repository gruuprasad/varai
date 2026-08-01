import path from "node:path";
import { createScanContext } from "../context.js";
import { queryTree } from "../treesitter.js";

const METHOD_NAMES = new Map([
  ["do_GET", "GET"], ["do_POST", "POST"], ["do_PUT", "PUT"],
  ["do_PATCH", "PATCH"], ["do_DELETE", "DELETE"],
]);

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    if (path.extname(file) !== ".py") continue;
    const content = await ctx.read(file);
    if (!content?.includes("BaseHTTPRequestHandler") || !content.includes("self.path")) continue;
    const tree = await ctx.tree(file, "python");
    if (!tree) continue;
    for (const { node: fn } of await queryTree(tree, "python", "(function_definition) @fn")) {
      const method = METHOD_NAMES.get(fn.childForFieldName("name")?.text);
      if (!method) continue;
      for (const comparison of fn.descendantsOfType("comparison_operator")) {
        const match = comparison.text.match(/^self\.path\s*(?:==|!=)\s*(["'])(\/[^"']*)\1$/);
        if (match) addRoute(facts, { file, method, routePath: match[2], node: comparison, layer: "ast" });
      }
      for (const call of fn.descendantsOfType("call")) {
        const match = call.text.match(/^self\.path\.startswith\(\s*(["'])(\/[^"']*\/)\1\s*\)$/);
        if (match) addRoute(facts, { file, method, routePath: `${match[2]}{topic_id}`, node: call, layer: "semantic" });
      }
    }
  }
  return facts;
}

function addRoute(facts, { file, method, routePath, node, layer }) {
  const evidence = [{ file, line: node.startPosition.row + 1 }];
  if (method === "GET" && routePath === "/") {
    facts.push({ kind: "page", name: "/", evidence, layer });
    return;
  }
  if (method === "GET" && !routePath.startsWith("/api/")) return;
  facts.push({ kind: "api_route", name: `${method} ${routePath}`, evidence, layer });
}
