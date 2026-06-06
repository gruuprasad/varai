const BACKEND_NAME = "native";
const langCache = new Map();
const queryCache = new Map();

let Parser = null;
let wasmBackend = null;

async function ensureInit() {
  if (Parser) return;
  Parser = (await import("tree-sitter")).default;
}

async function getWasmBackend() {
  if (wasmBackend) return wasmBackend;
  const mod = await import("./wasm.js");
  await mod.init();
  wasmBackend = mod;
  return wasmBackend;
}

const LANG_LOADERS = {
  python: async () => (await import("tree-sitter-python")).default,
  javascript: async () => (await import("tree-sitter-javascript")).default,
  tsx: async () => (await import("tree-sitter-typescript")).default.tsx,
  toml: async () => {
    throw new Error(`Native grammar not available for "toml"`);
  },
};

export const backend = BACKEND_NAME;

export async function init() {
  await ensureInit();
}

async function loadNativeLanguage(lang) {
  const loader = LANG_LOADERS[lang];
  if (!loader) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}

export async function loadLanguage(lang) {
  if (langCache.has(lang)) return langCache.get(lang);

  await ensureInit();

  const nativeLang = await loadNativeLanguage(lang);
  if (nativeLang) {
    langCache.set(lang, { native: true, obj: nativeLang });
  } else {
    const wasm = await getWasmBackend();
    const wasmLang = await wasm.loadLanguage(lang);
    langCache.set(lang, { native: false, obj: wasmLang, wasm: wasm });
  }
  return langCache.get(lang);
}

export async function parseTree(lang, code) {
  const entry = await loadLanguage(lang);
  if (!entry.native) {
    return entry.wasm.parseTree(lang, code);
  }
  const parser = new Parser();
  parser.setLanguage(entry.obj);
  return parser.parse(code);
}

export async function queryTree(tree, lang, queryString) {
  const entry = await loadLanguage(lang);
  if (!entry.native) {
    return entry.wasm.queryTree(tree, lang, queryString);
  }
  if (!queryCache.has(lang)) {
    queryCache.set(lang, new Map());
  }
  const langQueries = queryCache.get(lang);
  if (!langQueries.has(queryString)) {
    langQueries.set(queryString, new Parser.Query(entry.obj, queryString));
  }
  const query = langQueries.get(queryString);
  return query.captures(tree.rootNode);
}

export async function debugTree(lang, code) {
  const entry = await loadLanguage(lang);
  if (!entry.native) {
    return entry.wasm.debugTree(lang, code);
  }
  const parser = new Parser();
  parser.setLanguage(entry.obj);
  return parser.parse(code).rootNode.toString();
}
