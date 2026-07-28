import { mkdir, appendFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify } from "../system-model/canonicalize.js";

// Builder transcript store: audit evidence only. Events never become gate
// verdicts or requirement outcomes.

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

export function createBuilderStore(repoPath) {
  const root = path.join(repoPath, ".varai", "build-v1", "builder");
  const eventsPath = (sessionId) => path.join(root, "sessions", sessionId, "events.jsonl");
  const metaPath = (sessionId) => path.join(root, "sessions", sessionId, "meta.json");

  return {
    root,
    eventsPath,
    async appendEvent(sessionId, event) {
      const file = eventsPath(sessionId);
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
      return event;
    },
    async listEvents(sessionId, { limit = 500 } = {}) {
      let raw;
      try {
        raw = await readFile(eventsPath(sessionId), "utf8");
      } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
      }
      const lines = raw.split("\n").filter(Boolean);
      const sliced = lines.length > limit ? lines.slice(-limit) : lines;
      return sliced.map((line) => JSON.parse(line));
    },
    async putMeta(sessionId, meta) {
      await atomicWrite(metaPath(sessionId), canonicalStringify(meta));
      return meta;
    },
    async getMeta(sessionId) {
      try {
        return JSON.parse(await readFile(metaPath(sessionId), "utf8"));
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },
  };
}
