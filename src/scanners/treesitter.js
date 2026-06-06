import path from "node:path";
import { createRequire } from "node:module";
import Parser from "web-tree-sitter";

const require = createRequire(import.meta.url);
const WASM_DIR = path.join(
  path.dirname(require.resolve("tree-sitter-wasms/package.json")),
  "out"
);

let initDone = false;
const langCache = new Map();

async function ensureInit() {
  if (!initDone) {
    await Parser.init();
    initDone = true;
  }
}

async function loadLanguage(lang) {
  if (!langCache.has(lang)) {
    await ensureInit();
    const wasmPath = path.join(WASM_DIR, `tree-sitter-${lang}.wasm`);
    const Lang = await Parser.Language.load(wasmPath);
    langCache.set(lang, Lang);
  }
  return langCache.get(lang);
}

/**
 * Parse `code` as `lang` and run `queryString`.
 * Returns captures: Array<{ name: string, node: Node }>
 * node.text        — source text of the node (string)
 * node.startPosition.row  — 0-based line number
 * node.childForFieldName(fieldName)  — named child node or null
 */
export async function queryCaptures(lang, code, queryString) {
  const Lang = await loadLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(Lang);
  const tree = parser.parse(code);
  const query = Lang.query(queryString);
  return query.captures(tree.rootNode);
}

/** For the spike only — prints the s-expression parse tree. */
export async function debugTree(lang, code) {
  const Lang = await loadLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(Lang);
  return parser.parse(code).rootNode.toString();
}
