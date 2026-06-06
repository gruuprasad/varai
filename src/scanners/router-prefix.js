import path from "node:path";

export async function buildPrefixMap(files, ctx) {
  const prefixMap = new Map();
  const pyFiles = files.filter((f) => f.endsWith(".py"));
  if (pyFiles.length === 0) return prefixMap;

  const fileSet = new Set(pyFiles);

  const importsByFile = new Map();
  const routerDecls = new Map();
  const includeCalls = [];

  for (const file of pyFiles) {
    const content = await ctx.read(file);
    if (!content) continue;

    for (const line of content.split("\n")) {
      const fromMatch = line.match(/^\s*from\s+(\.?\S+)\s+import\s+(.+)$/);
      if (fromMatch) {
        const mod = fromMatch[1];
        const namesRaw = fromMatch[2].replace(/#.*$/, "").trim();
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

      const routerDeclM = line.match(/^\s*(\w+)\s*=\s*APIRouter\s*\(([^)]*)\)/);
      if (routerDeclM) {
        const prefixM = routerDeclM[2].match(/prefix\s*=\s*["']([^"']+)["']/);
        routerDecls.set(`${file}::${routerDeclM[1]}`, { prefix: prefixM ? prefixM[1] : "", file });
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

      const isPackage = path.basename(resolvedFile) === "__init__.py";
      const pkgDir = isPackage ? path.dirname(resolvedFile) : null;

      for (const { name, alias } of imp.names) {
        let nameFile = resolvedFile;
        if (isPackage) {
          const subPy = path.join(pkgDir, name + ".py");
          const subInit = path.join(pkgDir, name, "__init__.py");
          if (fileSet.has(subPy)) nameFile = subPy;
          else if (fileSet.has(subInit)) nameFile = subInit;
        }
        aliasToFile.set(`${file}::${alias}`, nameFile);
        aliasToFile.set(`${file}::${alias}_router`, nameFile);
      }
    }
  }

  const fileToAppPrefix = new Map();
  const childIncludes = new Map();

  for (const call of includeCalls) {
    const key = `${call.file}::${call.targetVar}`;
    let targetFile = aliasToFile.get(key);

    if (!targetFile) {
      const dir = path.dirname(call.file);
      const localPy = path.join(dir, call.targetVar + ".py");
      const localInit = path.join(dir, call.targetVar, "__init__.py");
      if (fileSet.has(localPy)) targetFile = localPy;
      else if (fileSet.has(localInit)) targetFile = localInit;
    }

    if (!targetFile) continue;

    if (call.receiver === "app") {
      targetFile = followRouterImport(targetFile, importsByFile, aliasToFile, routerDecls, fileSet);
      if (!fileToAppPrefix.has(targetFile) || call.prefix) {
        fileToAppPrefix.set(targetFile, call.prefix || "");
      }
    } else {
      const receiverKey = `${call.file}::${call.receiver}`;
      let receiverFile = aliasToFile.get(receiverKey);

      if (!receiverFile) {
        if (routerDecls.has(receiverKey) || call.receiver === "router") {
          receiverFile = call.file;
        }
      }

      if (receiverFile) {
        if (!childIncludes.has(receiverFile)) childIncludes.set(receiverFile, []);
        childIncludes.get(receiverFile).push({ targetFile, prefix: call.prefix });
      }
    }
  }

  for (const [file, appPrefix] of fileToAppPrefix) {
    const resolved = resolveChain(file, appPrefix, fileToAppPrefix, childIncludes, routerDecls, new Set());
    if (resolved !== null && resolved !== undefined) {
      prefixMap.set(file, resolved);
    }
  }

  return prefixMap;
}

function followRouterImport(file, importsByFile, aliasToFile, routerDecls, fileSet) {
  if (!importsByFile.has(file)) return file;

  for (const imp of importsByFile.get(file)) {
    for (const { name, alias } of imp.names) {
      if (alias === "router" || alias.endsWith("_router")) {
        const fullPath = resolveLocalImport(imp.mod, file, fileSet);
        if (fullPath) {
          const deeper = followRouterImport(fullPath, importsByFile, aliasToFile, routerDecls, fileSet);
          if (deeper !== file) return deeper;
        }
      }
    }
  }

  return file;
}

function resolveLocalImport(mod, fromFile, fileSet) {
  if (mod.startsWith(".")) {
    const depth = mod.match(/^\.+/)[0].length;
    const modPart = mod.replace(/^\.+/, "");
    let dir = path.dirname(fromFile);
    for (let i = 1; i < depth; i++) dir = path.dirname(dir);
    const parts = modPart ? modPart.split(".") : [];
    const fullPath = path.join(dir, ...parts);
    const pyFile = fullPath + ".py";
    const initFile = path.join(fullPath, "__init__.py");
    if (fileSet.has(pyFile)) return pyFile;
    if (fileSet.has(initFile)) return initFile;
  }
  return null;
}

function resolveModules(pyFiles) {
  const modToFile = new Map();

  for (const file of pyFiles) {
    const dir = path.dirname(file);
    const base = path.basename(file, ".py");

    if (dir === ".") {
      modToFile.set(base, file);
    } else {
      const fullMod = dir.replace(/\//g, ".") + "." + base;
      modToFile.set(fullMod, file);
    }

    if (base === "__init__" && dir !== ".") {
      modToFile.set(dir.replace(/\//g, "."), file);
    }
  }

  return modToFile;
}

function resolveModulePath(mod, fromFile, modToFile) {
  if (modToFile.has(mod)) return modToFile.get(mod);

  const modParts = mod.split(".");

  for (let i = 0; i <= modParts.length; i++) {
    const suffix = modParts.slice(i).join(".");
    if (!suffix) continue;
    for (const [modPath, file] of modToFile) {
      if (modPath.endsWith("." + suffix)) {
        return file;
      }
    }
  }

  const dir = path.dirname(fromFile);
  const localPy = path.join(dir, ...modParts) + ".py";
  const localInit = path.join(dir, ...modParts, "__init__.py");
  const localPyNorm = localPy.replace(/\\/g, "/");
  const localInitNorm = localInit.replace(/\\/g, "/");
  if (modToFile.has(localPyNorm)) return modToFile.get(localPyNorm);
  if (modToFile.has(localInitNorm)) return modToFile.get(localInitNorm);

  const fileSet = new Set(Object.values(modToFile));
  if (fileSet.has(localPyNorm)) return localPyNorm;
  if (fileSet.has(localInitNorm)) return localInitNorm;

  return null;
}

function resolveChain(file, prefix, fileToAppPrefix, childIncludes, routerDecls, visited) {
  if (visited.has(file)) return prefix;
  visited.add(file);

  let full = prefix;

  for (const [key, decl] of routerDecls) {
    if (key.startsWith(file + "::")) {
      if (decl.prefix) {
        full = joinPrefixes(prefix, decl.prefix);
      }
      break;
    }
  }

  const children = childIncludes.get(file);
  if (!children) return full;

  for (const child of children) {
    const childPrefix = child.prefix || "";
    const combinedPrefix = joinPrefixes(full, childPrefix);
    const subChain = resolveChain(child.targetFile, combinedPrefix, fileToAppPrefix, childIncludes, routerDecls, visited);
    if (subChain !== null && subChain !== undefined) {
      if (!fileToAppPrefix.has(child.targetFile)) {
        fileToAppPrefix.set(child.targetFile, subChain);
      }
    }
  }

  return full;
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
