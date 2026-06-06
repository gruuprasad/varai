import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { queryCaptures } from "../treesitter.js";

const LANG_FOR_EXT = {
  ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "tsx", ".tsx": "tsx"
};

const ROUTE_PATH_RE = /\bpath\s*=\s*["']([^"']+)["']/;

export async function extract(repoPath, files) {
  const facts = [];
  for (const file of files) {
    const lang = LANG_FOR_EXT[path.extname(file)];
    if (!lang) continue;
    let content;
    try {
      const s = await stat(path.join(repoPath, file));
      if (s.size > 500_000) continue;
      content = await readFile(path.join(repoPath, file), "utf8");
    } catch { continue; }

    const inStoreDir = file.includes("/store/") || file.includes("/stores/");

    let hasZustandImport = false;
    for (const { node } of await queryCaptures(lang, content, "(import_statement) @imp")) {
      const srcNode = node.childForFieldName("source");
      const srcText = srcNode ? srcNode.text : node.text;
      if (srcText.includes("zustand")) { hasZustandImport = true; break; }
    }

    let hasCreateCall = false;
    for (const { node } of await queryCaptures(lang, content, "(call_expression function: (identifier) @fn)")) {
      if (node.text === "create") { hasCreateCall = true; break; }
    }

    if (inStoreDir || (hasZustandImport && hasCreateCall)) {
      facts.push({
        kind: "state_store",
        name: path.basename(file, path.extname(file)),
        evidence: [{ file }],
        layer: hasCreateCall ? "ast" : "heuristic"
      });
    }

    for (const { node } of await queryCaptures(lang, content,
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
