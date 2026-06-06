import path from "node:path";

export async function buildPrefixMap(files, ctx) {
  const prefixMap = new Map();
  const pyFiles = files.filter((f) => f.endsWith(".py"));
  if (pyFiles.length === 0) return prefixMap;

  const importsByFile = new Map();
  const routerPrefixes = new Map();
  const includeCalls = [];

  for (const file of pyFiles) {
    const content = await ctx.read(file);
    if (!content) continue;

    for (const line of content.split("\n")) {
      const fromMatch = line.match(/^from\s+(\.?\S+)\s+import\s+(.+)$/);
      if (fromMatch) {
        const mod = fromMatch[1];
        const namesRaw = fromMatch[2];
        const parsedNames = [];
        for (const part of namesRaw.split(",")) {
          const cleaned = part.trim();
          if (!cleaned) continue;
          const aliasM = cleaned.match(/^(\w+)\s+as\s+(\w+)$/);
          if (aliasM) {
            parsedNames.push({ name: aliasM[1], alias: aliasM[2] });
          } else {
            parsedNames.push({ name: cleaned, alias: cleaned });
          }
        }
        if (!importsByFile.has(file)) importsByFile.set(file, []);
        importsByFile.get(file).push({ mod, names: parsedNames });
        continue;
      }

      const routerDeclM = line.match(/^(\w+)\s*=\s*APIRouter\s*\([^)]*prefix\s*=\s*["']([^"']+)["']/);
      if (routerDeclM) {
        routerPrefixes.set(`${file}::${routerDeclM[1]}`, routerDeclM[2]);
        continue;
      }

      const includeM = line.match(/(?:app|(\w+))\.include_router\s*\([^)]*\)/);
      if (includeM) {
        const fullCall = includeM[0];
        const receiver = includeM[1] || "app";
        const routerVarM = fullCall.match(/include_router\s*\(\s*(\w+)/);
        const prefixM = fullCall.match(/prefix\s*=\s*["']([^"']+)["']/);
        if (routerVarM) {
          includeCalls.push({
            file,
            receiver,
            targetVar: routerVarM[1],
            prefix: prefixM ? prefixM[1] : "",
          });
        }
      }
    }
  }

  const modToFile = resolveModules(pyFiles);

  const aliasToFile = new Map();
  for (const [file, imports] of importsByFile) {
    for (const imp of imports) {
      let resolvedFile = resolveModulePath(imp.mod, file, modToFile);
      if (!resolvedFile) continue;
      for (const { name, alias } of imp.names) {
        aliasToFile.set(`${file}::${alias}`, resolvedFile);
        aliasToFile.set(`${file}::${alias}_router`, resolvedFile);
      }
    }
  }

  const fileToAppPrefix = new Map();
  const childIncludes = new Map();

  for (const call of includeCalls) {
    const key = `${call.file}::${call.targetVar}`;
    const targetFile = aliasToFile.get(key) || modToFile.get(resolveSimpleModule(call.targetVar, call.file));

    if (!targetFile) continue;

    if (call.receiver === "app") {
      if (!fileToAppPrefix.has(targetFile) || call.prefix) {
        fileToAppPrefix.set(targetFile, call.prefix || "");
      }
    } else {
      const receiverKey = `${call.file}::${call.receiver}`;
      const receiverFile = aliasToFile.get(receiverKey);
      if (receiverFile) {
        if (!childIncludes.has(receiverFile)) childIncludes.set(receiverFile, []);
        childIncludes.get(receiverFile).push({ targetFile, prefix: call.prefix });
      }
    }
  }

  for (const [file, appPrefix] of fileToAppPrefix) {
    const resolved = resolveChain(file, appPrefix, fileToAppPrefix, childIncludes, routerPrefixes, new Set());
    if (resolved !== null) {
      prefixMap.set(file, resolved);
    }
  }

  return prefixMap;
}

function resolveModules(pyFiles) {
  const modToFile = new Map();
  const fileSet = new Set(pyFiles);

  for (const file of pyFiles) {
    const dir = path.dirname(file);
    const base = path.basename(file, ".py");

    if (dir === ".") {
      modToFile.set(base, file);
    } else {
      modToFile.set(dir.replace(/\//g, ".") + "." + base, file);
    }

    const initFile = path.join(dir, "__init__.py");
    if (fileSet.has(initFile) && dir !== ".") {
      modToFile.set(dir.replace(/\//g, "."), initFile);
    }
  }

  return modToFile;
}

function resolveModulePath(mod, fromFile, modToFile) {
  if (modToFile.has(mod)) return modToFile.get(mod);

  const dir = path.dirname(fromFile);
  if (dir === ".") return modToFile.get(mod) || null;

  const resolved = resolveRelative(mod, dir, modToFile);
  if (resolved) return resolved;

  return modToFile.get(mod) || null;
}

function resolveRelative(mod, fromDir, modToFile) {
  const parts = mod.split(".");
  const absPath = path.join(fromDir, ...parts);
  const normed = absPath.replace(/\\/g, "/");

  for (const [modPath, file] of modToFile) {
    if (file.replace(/\\/g, "/") === normed + ".py") return file;
    if (file.replace(/\\/g, "/") === normed + "/__init__.py") return file;
  }

  const filePath = normed + ".py";
  for (const [modPath, file] of modToFile) {
    if (file === filePath) return file;
  }

  const initPath = normed + "/__init__.py";
  for (const [modPath, file] of modToFile) {
    if (file === initPath) return file;
  }

  return null;
}

function resolveSimpleModule(varName, fromFile) {
  return varName;
}

function resolveChain(file, prefix, fileToAppPrefix, childIncludes, routerPrefixes, visited) {
  if (visited.has(file)) return prefix;
  visited.add(file);

  let full = prefix;

  for (const [key, ownPrefix] of routerPrefixes) {
    if (key.startsWith(file + "::")) {
      full = joinPrefixes(prefix, ownPrefix);
      break;
    }
  }

  const children = childIncludes.get(file);
  if (!children) return full;

  for (const child of children) {
    const childPrefix = child.prefix || "";
    const subChain = resolveChain(child.targetFile, joinPrefixes(full, childPrefix), fileToAppPrefix, childIncludes, routerPrefixes, visited);
    if (subChain !== null && !prefixMapHas(fileToAppPrefix, child.targetFile)) {
      if (!fileToAppPrefix.has(child.targetFile)) {
        fileToAppPrefix.set(child.targetFile, subChain);
      }
    }
    full = subChain || full;
  }

  return full;
}

function prefixMapHas(map, file) {
  return map.has(file);
}

function joinPrefixes(a, b) {
  if (!a && !b) return "";
  if (!a) return b;
  if (!b) return a;
  const aEnd = a.endsWith("/");
  const bStart = b.startsWith("/");
  if (aEnd && bStart) return a + b.slice(1);
  if (aEnd || bStart) return a + b;
  return a + "/" + b;
}
