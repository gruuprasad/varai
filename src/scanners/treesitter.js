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
const parserCache = new Map();
const queryCache = new Map();

async function ensureInit() {
  if (!initDone) {
    await Parser.init();
    initDone = true;
  }
}

export async function loadLanguage(lang) {
  if (!langCache.has(lang)) {
    await ensureInit();
    const wasmPath = path.join(WASM_DIR, `tree-sitter-${lang}.wasm`);
    const Lang = await Parser.Language.load(wasmPath);
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

export async function queryCaptures(lang, code, queryString) {
  const tree = await parseTree(lang, code);
  return queryTree(tree, lang, queryString);
}

export async function debugTree(lang, code) {
  const Lang = await loadLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(Lang);
  return parser.parse(code).rootNode.toString();
}
