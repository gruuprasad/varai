import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";

export const EXTRACTOR_VERSION = 2; // added runnable (script/service) and schema extractors

const CACHE_FORMAT_VERSION = 1;

export function createFactCache({
  cacheDir,
  formatVersion = CACHE_FORMAT_VERSION,
  extractorVersion = EXTRACTOR_VERSION,
  stacks = [],
  prefixFingerprint = "",
  enabled = true,
}) {
  const factsDir = path.join(cacheDir, "facts");
  const stacksKey = [...stacks].sort().join(",");

  function cacheHash(file, content) {
    const h = createHash("sha256");
    h.update(String(formatVersion));
    h.update(String(extractorVersion));
    h.update(content);
    h.update(stacksKey);
    h.update(prefixFingerprint);
    return h.digest("hex");
  }

  function keyFor(file, content) {
    return cacheHash(file, content);
  }

  function entryPath(hash) {
    const prefix = hash.slice(0, 2);
    return path.join(factsDir, prefix, `${hash}.json`);
  }

  async function get(file, content) {
    if (!enabled) return null;
    try {
      const hash = cacheHash(file, content);
      const raw = await readFile(entryPath(hash), "utf8");
      const entry = JSON.parse(raw);
      if (entry.v === formatVersion && entry.file === file && entry.hash === hash) {
        return entry.facts;
      }
    } catch { /* cache miss or read failure */ }
    return null;
  }

  async function set(file, content, facts) {
    if (!enabled) return;
    try {
      const hash = cacheHash(file, content);
      const entryPath_ = entryPath(hash);
      const dir = path.dirname(entryPath_);
      await mkdir(dir, { recursive: true });
      const tmpPath = `${entryPath_}.tmp-${process.pid}`;
      const entry = { v: formatVersion, hash, file, facts };
      await writeFile(tmpPath, JSON.stringify(entry), "utf8");
      await rename(tmpPath, entryPath_);
    } catch { /* non-fatal on read-only FS / CI */ }
  }

  return { keyFor, get, set, enabled, factsDir };
}
