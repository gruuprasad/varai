import path from "node:path";
import { queryTree } from "../treesitter.js";

function normalizeImports(content) {
  return content.replace(/^(\s*from\s+[\w.]+\s+import\s*)\(([^)]*)\)/gms,
    (_, prefix, names) => prefix + names.replace(/\s+/g, " ").trim());
}

export function createSymbolIndex(files, ctx, { workBudget = 10_000 } = {}) {
  const fileSet = new Set(files.filter((file) => file.endsWith(".py")));
  const modToFile = buildModuleMap(fileSet);
  const fnCache = new Map();
  const classCache = new Map();
  const importCache = new Map();
  let work = 0;

  async function functionsIn(file) {
    if (fnCache.has(file)) return fnCache.get(file);
    if (++work > workBudget) return new Map();
    const map = new Map();
    const tree = await ctx.tree(file, "python");
    if (tree) for (const { node } of await queryTree(tree, "python", "(function_definition) @fn")) {
      const name = node.childForFieldName("name")?.text;
      if (name) map.set(name, node);
    }
    fnCache.set(file, map);
    return map;
  }

  async function classesIn(file) {
    if (classCache.has(file)) return classCache.get(file);
    if (++work > workBudget) return new Map();
    const map = new Map();
    const tree = await ctx.tree(file, "python");
    if (tree) for (const { node } of await queryTree(tree, "python", "(class_definition) @class")) {
      const name = node.childForFieldName("name")?.text;
      if (!name) continue;
      map.set(name, {
        id: `python:${file}:${name}`,
        kind: "class",
        language: "python",
        file,
        name,
        line: node.startPosition.row + 1,
        bases: classBases(node),
        node,
      });
    }
    classCache.set(file, map);
    return map;
  }

  async function importsIn(file) {
    if (importCache.has(file)) return importCache.get(file);
    const map = new Map();
    const content = normalizeImports((await ctx.read(file)) ?? "");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*from\s+(\.?[\w.]+)\s+import\s+(.+)$/);
      if (!match) continue;
      const target = resolveModule(match[1], file, modToFile, fileSet);
      if (!target) continue;
      for (const item of match[2].replace(/[()#].*$/, "").split(",")) {
        const [imported, alias] = item.trim().split(/\s+as\s+/);
        if (imported && imported !== "*") map.set(alias ?? imported, { target, imported });
      }
    }
    importCache.set(file, map);
    return map;
  }

  async function resolveFunction(fromFile, name, seen = new Set()) {
    if (++work > workBudget) return null;
    const key = `${fromFile}:${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const local = await functionsIn(fromFile);
    if (local.has(name)) return { file: fromFile, node: local.get(name) };
    const imported = (await importsIn(fromFile)).get(name);
    if (!imported) return null;
    const targetFns = await functionsIn(imported.target);
    if (targetFns.has(imported.imported)) return { file: imported.target, node: targetFns.get(imported.imported) };
    return resolveFunction(imported.target, imported.imported, seen);
  }

  async function resolveDeclaration(fromFile, name, seen = new Set()) {
    if (++work > workBudget) return null;
    const normalized = normalizeTypeName(name);
    const key = `${fromFile}:${normalized}`;
    if (!normalized || seen.has(key)) return null;
    seen.add(key);
    const local = await classesIn(fromFile);
    if (local.has(normalized)) return local.get(normalized);
    const imported = (await importsIn(fromFile)).get(normalized);
    if (!imported) return null;
    const targetClasses = await classesIn(imported.target);
    if (targetClasses.has(imported.imported)) return targetClasses.get(imported.imported);
    return resolveDeclaration(imported.target, imported.imported, seen);
  }

  async function allDeclarations() {
    const result = [];
    for (const file of [...fileSet].sort()) result.push(...(await classesIn(file)).values());
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }

  async function findDeclarationsByName(name) {
    const normalized = normalizeTypeName(name);
    return (await allDeclarations()).filter((item) => item.name === normalized);
  }

  function describeFunction(file, node) {
    const name = node.childForFieldName("name")?.text ?? "anonymous";
    const parameters = new Map();
    const params = node.childForFieldName("parameters");
    for (const param of params?.namedChildren ?? []) {
      const paramName = param.childForFieldName("name")?.text ??
        param.namedChildren?.find((child) => child.type === "identifier")?.text ??
        (param.type === "identifier" ? param.text : null);
      const type = normalizeTypeName(param.childForFieldName("type")?.text);
      if (paramName) parameters.set(paramName, type || null);
    }
    return {
      id: `python:${file}:${name}`,
      kind: "function",
      file,
      name,
      line: node.startPosition.row + 1,
      returnType: normalizeTypeName(node.childForFieldName("return_type")?.text),
      returnTypes: extractTypeNames(node.childForFieldName("return_type")?.text),
      parameters,
      node,
    };
  }

  return {
    resolveFunction,
    resolveDeclaration,
    allDeclarations,
    findDeclarationsByName,
    describeFunction,
    stats: () => ({ work, workBudget, exhausted: work > workBudget }),
  };
}

export function extractTypeNames(value) {
  const excluded = new Set([
    "Annotated", "Any", "Dict", "Iterable", "List", "Literal", "Mapping",
    "MutableMapping", "MutableSequence", "None", "Optional", "Sequence", "Set",
    "Tuple", "dict", "list", "set", "tuple",
  ]);
  return [...new Set(String(value ?? "").match(/[A-Za-z_]\w*/g) ?? [])]
    .filter((name) => !excluded.has(name));
}

function classBases(node) {
  const supers = node.childForFieldName("superclasses");
  if (!supers) return [];
  return (supers.namedChildren ?? []).map((item) => normalizeTypeName(item.text)).filter(Boolean);
}

export function normalizeTypeName(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^(?:list|dict|set|tuple|Sequence|MutableSequence|Iterable|Mapping|MutableMapping)\s*\[/i.test(text)) return null;
  const annotated = text.match(/^Annotated\[\s*([A-Za-z_]\w*)/);
  if (annotated) return annotated[1];
  const withoutOptional = text.replace(/^Optional\[(.+)\]$/, "$1").replace(/\s*\|\s*None\b/g, "");
  const match = withoutOptional.match(/[A-Za-z_]\w*(?=\s*(?:\]|$))/);
  return match?.[0] ?? null;
}

function buildModuleMap(fileSet) {
  const map = new Map();
  for (const file of fileSet) {
    const dir = path.dirname(file);
    const base = path.basename(file, ".py");
    const mod = dir === "." ? base : dir.replaceAll("/", ".") + "." + base;
    map.set(mod, file);
    if (base === "__init__" && dir !== ".") map.set(dir.replaceAll("/", "."), file);
  }
  return map;
}

function resolveModule(mod, fromFile, modToFile, fileSet) {
  if (mod.startsWith(".")) {
    const depth = mod.match(/^\.+/)[0].length;
    let dir = path.dirname(fromFile);
    for (let i = 1; i < depth; i++) dir = path.dirname(dir);
    const parts = mod.replace(/^\.+/, "").split(".").filter(Boolean);
    for (const candidate of [path.join(dir, ...parts) + ".py", path.join(dir, ...parts, "__init__.py")]) {
      if (fileSet.has(candidate)) return candidate;
    }
    return null;
  }
  if (modToFile.has(mod)) return modToFile.get(mod);
  for (const [name, file] of modToFile) if (name.endsWith(`.${mod}`)) return file;
  return null;
}
