let activeBackend = null;
let backendName = null;

export async function selectBackend(name = "native") {
  if (name !== "native" && name !== "wasm") {
    name = "native";
  }

  if (activeBackend && backendName === name) return activeBackend;

  if (name === "native") {
    try {
      const mod = await import("./backends/native.js");
      await mod.init();
      activeBackend = mod;
      backendName = name;
      return activeBackend;
    } catch (err) {
      if (process.env.VARAI_PARSER !== "wasm") {
        process.stderr.write(`varai: native parser unavailable (${err.message}), falling back to wasm\n`);
      }
    }
  }

  const mod = await import("./backends/wasm.js");
  await mod.init();
  activeBackend = mod;
  backendName = "wasm";
  return activeBackend;
}

export async function loadLanguage(lang) {
  const backend = await getBackend();
  return backend.loadLanguage(lang);
}

export async function parseTree(lang, code) {
  const backend = await getBackend();
  return backend.parseTree(lang, code);
}

export async function queryTree(tree, lang, queryString) {
  const backend = await getBackend();
  return backend.queryTree(tree, lang, queryString);
}

export async function queryCaptures(lang, code, queryString) {
  const tree = await parseTree(lang, code);
  return queryTree(tree, lang, queryString);
}

export async function debugTree(lang, code) {
  const backend = await getBackend();
  return backend.debugTree(lang, code);
}

async function getBackend() {
  if (!activeBackend) {
    const parser = process.env.VARAI_PARSER ?? "native";
    await selectBackend(parser);
  }
  return activeBackend;
}
