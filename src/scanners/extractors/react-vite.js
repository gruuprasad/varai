import path from "node:path";
import { createScanContext } from "../context.js";
import { queryTree } from "../treesitter.js";

const LANG_FOR_EXT = {
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "tsx", ".tsx": "tsx"
};

const ROUTE_PATH_RE = /\bpath\s*=\s*["']([^"']+)["']/;

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    const lang = LANG_FOR_EXT[path.extname(file)];
    if (!lang) continue;

    const content = await ctx.read(file);
    if (!content) continue;

    if (isComponentScope(file)) {
      extractComponentsAndHooks(content, file, facts);
    }

    const needsParse = content.includes("zustand") || /\bRoute\b/.test(content);
    if (!needsParse) continue;

    const tree = await ctx.tree(file, lang);
    if (!tree) continue;

    let hasZustandImport = false;
    for (const { node } of await queryTree(tree, lang, "(import_statement) @imp")) {
      const srcNode = node.childForFieldName("source");
      const srcText = srcNode ? srcNode.text : node.text;
      if (srcText.includes("zustand")) { hasZustandImport = true; break; }
    }

    let hasCreateCall = false;
    for (const { node } of await queryTree(tree, lang, "(call_expression function: (identifier) @fn)")) {
      if (node.text === "create") { hasCreateCall = true; break; }
    }

    if (hasZustandImport && hasCreateCall) {
      facts.push({
        kind: "state_store",
        name: path.basename(file, path.extname(file)),
        evidence: [{ file }],
        layer: "ast"
      });
    }

    for (const { node } of await queryTree(tree, lang,
      "[(jsx_self_closing_element)(jsx_opening_element)] @el")) {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text !== "Route") continue;
      const m = node.text.match(ROUTE_PATH_RE);
      if (!m) continue;
      facts.push({ kind: "page", name: m[1], evidence: [{ file, line: node.startPosition.row + 1 }], layer: "ast" });
    }
  }
  return facts;
}

function isComponentScope(file) {
  return /\/components\/|\/pages\/|\/hooks\//.test("/" + file);
}

const COMP_FUNC_RE = /export\s+(?:async\s+)?function\s+(\w+)/g;
const COMP_CONST_RE = /export\s+const\s+(\w+)\s*=\s*(?:\([^)]*\)|\(\s*\))\s*=>/g;

function extractComponentsAndHooks(content, file, facts) {
  for (const match of content.matchAll(COMP_FUNC_RE)) {
    const name = match[1];
    const lineIdx = content.slice(0, match.index).split("\n").length;
    classifyAndPush(name, lineIdx, file, facts);
  }

  for (const match of content.matchAll(COMP_CONST_RE)) {
    const name = match[1];
    const lineIdx = content.slice(0, match.index).split("\n").length;
    classifyAndPush(name, lineIdx, file, facts);
  }
}

function classifyAndPush(name, line, file, facts) {
  if (/^[A-Z]/.test(name) && !/^[A-Z]+$/.test(name)) {
    facts.push({ kind: "component", name, evidence: [{ file, line }], layer: "ast" });
  }
}
