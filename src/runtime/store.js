import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";
import { VERIFICATION_DIR } from "./schema.js";

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

export function createVerificationStore(repoPath) {
  const root = path.join(repoPath, VERIFICATION_DIR);
  const objectPath = (hash) => path.join(root, "objects", hash.slice(0, 2), `${hash}.json`);
  const runPath = (id) => path.join(root, "runs", `${id}.json`);
  const latestPath = path.join(root, "latest.json");

  return {
    root,
    async putObject(value) {
      const content = canonicalStringify(value);
      const hash = semanticHash(content);
      const file = objectPath(hash);
      try { await readFile(file, "utf8"); } catch { await atomicWrite(file, content); }
      return hash;
    },
    async getObject(hash) {
      return JSON.parse(await readFile(objectPath(hash), "utf8"));
    },
    async putRun(run) {
      await atomicWrite(runPath(run.id), canonicalStringify(run));
      await atomicWrite(latestPath, canonicalStringify({ id: run.id, contentHash: run.contentHash, createdAt: run.createdAt }));
      return run;
    },
    async getRun(id) {
      return JSON.parse(await readFile(runPath(id), "utf8"));
    },
    async getLatest() {
      try {
        const latest = JSON.parse(await readFile(latestPath, "utf8"));
        return this.getRun(latest.id);
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },
    async listRuns() {
      let names = [];
      try { names = await readdir(path.join(root, "runs")); } catch (err) { if (err.code !== "ENOENT") throw err; }
      const runs = await Promise.all(names.filter((name) => name.endsWith(".json"))
        .map((name) => this.getRun(name.slice(0, -5))));
      return runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id));
    },
  };
}
