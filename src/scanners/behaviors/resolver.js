import path from "node:path";
import { queryTree } from "../treesitter.js";

// Resolve a called name to a same-repo top-level function_definition node.
// v1: local definitions, then direct `from <mod> import <name>` imports. No
// re-export chains, no dynamic dispatch (spec call-graph stance).
export function createResolver(files, ctx) {
  const fileSet = new Set(files.filter((f) => f.endsWith(".py")));
  const modToFile = buildModuleMap(fileSet);
  const fnCache = new Map();   // file -> Map(name -> node)
  const importCache = new Map(); // file -> Map(name -> targetFile)

  async function functionsIn(file) {
    if (fnCache.has(file)) return fnCache.get(file);
    const map = new Map();
    const tree = await ctx.tree(file, "python");
    if (tree) {
      for (const { node } of await queryTree(tree, "python", "(function_definition) @fn")) {
        const nameNode = node.childForFieldName("name");
        if (nameNode) map.set(nameNode.text, node);
      }
    }
    fnCache.set(file, map);
    return map;
  }

  async function importsIn(file) {
    if (importCache.has(file)) return importCache.get(file);
    const map = new Map();
    const content = await ctx.read(file);
    if (content) {
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*from\s+(\.?[\w.]+)\s+import\s+(.+)$/);
        if (!m) continue;
        const target = resolveModule(m[1], file, modToFile, fileSet);
        if (!target) continue;
        for (const raw of m[2].replace(/[()#].*$/, "").split(",")) {
          const nm = raw.trim().split(/\s+as\s+/)[0].trim();
          if (nm && nm !== "*") map.set(nm, target);
        }
      }
    }
    importCache.set(file, map);
    return map;
  }

  return {
    async resolveFunction(fromFile, name) {
      const local = await functionsIn(fromFile);
      if (local.has(name)) return { file: fromFile, node: local.get(name) };
      const imports = await importsIn(fromFile);
      const targetFile = imports.get(name);
      if (targetFile) {
        const fns = await functionsIn(targetFile);
        if (fns.has(name)) return { file: targetFile, node: fns.get(name) };
      }
      return null;
    },
  };
}

function buildModuleMap(fileSet) {
  const map = new Map();
  for (const file of fileSet) {
    const dir = path.dirname(file);
    const base = path.basename(file, ".py");
    const mod = dir === "." ? base : dir.replace(/\//g, ".") + "." + base;
    map.set(mod, file);
    if (base === "__init__" && dir !== ".") map.set(dir.replace(/\//g, "."), file);
  }
  return map;
}

function resolveModule(mod, fromFile, modToFile, fileSet) {
  if (mod.startsWith(".")) {
    const depth = mod.match(/^\.+/)[0].length;
    let dir = path.dirname(fromFile);
    for (let i = 1; i < depth; i++) dir = path.dirname(dir);
    const parts = mod.replace(/^\.+/, "").split(".").filter(Boolean);
    const py = path.join(dir, ...parts) + ".py";
    const init = path.join(dir, ...parts, "__init__.py");
    if (fileSet.has(py)) return py;
    if (fileSet.has(init)) return init;
    return null;
  }
  if (modToFile.has(mod)) return modToFile.get(mod);
  const parts = mod.split(".");
  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.slice(i).join(".");
    for (const [m, f] of modToFile) if (m.endsWith("." + suffix)) return f;
  }
  return null;
}
