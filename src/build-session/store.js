import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

export function createBuildSessionStore(repoPath) {
  const root = path.join(repoPath, ".varai", "build-v1");
  const objectPath = (hash) => path.join(root, "objects", hash.slice(0, 2), `${hash}.json`);
  const sessionPath = (id) => path.join(root, "sessions", `${id}.json`);
  const activePath = path.join(root, "active.json");
  return {
    root,
    async putObject(value) {
      const content = canonicalStringify(value);
      const hash = semanticHash(content);
      const file = objectPath(hash);
      try { await readFile(file, "utf8"); } catch { await atomicWrite(file, content); }
      return hash;
    },
    async getObject(hash) { return JSON.parse(await readFile(objectPath(hash), "utf8")); },
    async putSession(session) { await atomicWrite(sessionPath(session.id), canonicalStringify(session)); return session; },
    async getSession(id) { return JSON.parse(await readFile(sessionPath(id), "utf8")); },
    async listSessions() {
      let names = [];
      try { names = await readdir(path.join(root, "sessions")); } catch (err) { if (err.code !== "ENOENT") throw err; }
      const sessions = await Promise.all(names.filter((name) => name.endsWith(".json"))
        .map((name) => this.getSession(name.slice(0, -5))));
      return sessions.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)) || a.id.localeCompare(b.id));
    },
    async getActive() { try { return JSON.parse(await readFile(activePath, "utf8")); } catch (err) { if (err.code === "ENOENT") return null; throw err; } },
    async setActive(value) { await atomicWrite(activePath, canonicalStringify(value)); return value; },
    async clearActive() { try { await rename(activePath, `${activePath}.closed-${Date.now()}`); } catch (err) { if (err.code !== "ENOENT") throw err; } },
  };
}
