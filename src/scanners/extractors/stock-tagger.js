import { buildCatalog } from "./stock-catalog.js";

function matchesAnyPath(fact, pathRegex) {
  if (!pathRegex) return true;
  for (const ev of fact.evidence ?? []) {
    if (pathRegex.test(ev.file)) return true;
  }
  return false;
}

function matchesSignature(fact, sig) {
  if (fact.kind !== sig.kind) return false;
  if (!sig.nameRegex.test(fact.name)) return false;
  return matchesAnyPath(fact, sig.pathRegex);
}

export function tagStock(facts, config) {
  const catalog = buildCatalog(config);
  const instances = new Map();

  for (const fact of facts) {
    const tags = [];
    for (const pattern of catalog) {
      for (const sig of pattern.signatures) {
        if (matchesSignature(fact, sig)) {
          tags.push(pattern.name);
          let bucket = instances.get(pattern.name);
          if (!bucket) { bucket = []; instances.set(pattern.name, bucket); }
          bucket.push({ fact, role: sig.role });
          break;
        }
      }
    }
    if (tags.length) fact.stock = tags;
  }

  return { facts, instances };
}

export const _internal = { matchesSignature, matchesAnyPath };
