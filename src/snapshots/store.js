import path from "node:path";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { canonicalStringify } from "../system-model/canonicalize.js";
import { semanticHash } from "../system-model/identity.js";

export const SNAPSHOT_FORMAT_VERSION = 1;

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, content, "utf8");
  await rename(temp, file);
}

export function createSnapshotStore(repoPath) {
  // A versioned namespace intentionally ignores pre-release snapshots from the
  // discarded product shape. Local snapshots are regenerated, not migrated.
  const root = path.join(repoPath, ".varai", "model-v1");
  const objectPath = (hash) => path.join(root, "objects", hash.slice(0, 2), `${hash}.json`);
  const snapshotPath = (id) => path.join(root, "snapshots", `${id}.json`);
  const refPath = (sha) => path.join(root, "refs", "commits", `${sha}.json`);

  return {
    root,
    async putObject(value) {
      const content = canonicalStringify(value);
      const hash = semanticHash(content);
      const file = objectPath(hash);
      try { await readFile(file); } catch { await atomicWrite(file, content); }
      return hash;
    },
    async getObject(hash) {
      return JSON.parse(await readFile(objectPath(hash), "utf8"));
    },
    async putSnapshot(manifest) {
      await atomicWrite(snapshotPath(manifest.id), canonicalStringify(manifest));
      if (manifest.git.clean) await atomicWrite(refPath(manifest.git.head), canonicalStringify({ snapshotId: manifest.id }));
      return manifest;
    },
    async getSnapshot(id) {
      return JSON.parse(await readFile(snapshotPath(id), "utf8"));
    },
    async getCommitRef(sha) {
      try { return JSON.parse(await readFile(refPath(sha), "utf8")); } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },
    async listSnapshots() {
      let names = [];
      try { names = await readdir(path.join(root, "snapshots")); } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
      const snapshots = await Promise.all(names.filter((name) => name.endsWith(".json"))
        .map((name) => this.getSnapshot(name.slice(0, -5))));
      return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    },
  };
}
