import path from "node:path";
import { createRequire } from "node:module";

const BACKEND_NAME = "wasm";
let initDone = false;
const langCache = new Map();
const parserCache = new Map();
const queryCache = new Map();

let Parser = null;

async function ensureInit() {
  if (!initDone) {
    Parser = (await import("web-tree-sitter")).default;
    await Parser.init();
    initDone = true;
  }
}

function wasmPath(lang) {
  const require = createRequire(import.meta.url);
  const WASM_DIR = path.join(
    path.dirname(require.resolve("tree-sitter-wasms/package.json")),
    "out"
  );
  return path.join(WASM_DIR, `tree-sitter-${lang}.wasm`);
}

const LANG_WASM_MAP = {
  python: "python",
  javascript: "javascript",
  tsx: "tsx",
  toml: "toml",
};

export const backend = BACKEND_NAME;

export async function init() {
  await ensureInit();
}

export async function loadLanguage(lang) {
  if (!langCache.has(lang)) {
    await ensureInit();
    const wasm = wasmPath(LANG_WASM_MAP[lang] ?? lang);
    const Lang = await Parser.Language.load(wasm);
    langCache.set(lang, Lang);
  }
  return langCache.get(lang);
}

export async function parseTree(lang, code) {
  const Lang = await loadLanguage(lang);
  if (!parserCache.has(lang)) {
    const parser = new Parser();
    parser.setLanguage(Lang);
    parserCache.set(lang, parser);
  }
  const parser = parserCache.get(lang);
  return parser.parse(code);
}

export async function queryTree(tree, lang, queryString) {
  if (!queryCache.has(lang)) {
    queryCache.set(lang, new Map());
  }
  const langQueries = queryCache.get(lang);
  if (!langQueries.has(queryString)) {
    const Lang = await loadLanguage(lang);
    langQueries.set(queryString, Lang.query(queryString));
  }
  const query = langQueries.get(queryString);
  return query.captures(tree.rootNode);
}

export async function debugTree(lang, code) {
  const Lang = await loadLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(Lang);
  return parser.parse(code).rootNode.toString();
}
