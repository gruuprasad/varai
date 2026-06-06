import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { parseTree } from "./treesitter.js";

export function createScanContext(repoPath, opts = {}) {
  const maxBytes = opts.maxBytes ?? 500_000;
  const readCache = new Map();
  const treeCache = new Map();

  return {
    repoPath,

    async read(file) {
      if (readCache.has(file)) return readCache.get(file);
      let content = null;
      try {
        const abs = path.join(repoPath, file);
        const s = await stat(abs);
        if (s.size > maxBytes) {
          readCache.set(file, null);
          return null;
        }
        content = await readFile(abs, "utf8");
      } catch {
        content = null;
      }
      readCache.set(file, content);
      return content;
    },

    async tree(file, lang) {
      const key = `${file}:${lang}`;
      if (treeCache.has(key)) return treeCache.get(key);
      const code = await this.read(file);
      if (code === null) {
        treeCache.set(key, null);
        return null;
      }
      const tree = await parseTree(lang, code);
      treeCache.set(key, tree);
      return tree;
    },

    prefixMap: null
  };
}
