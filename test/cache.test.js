import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createObservationCache } from "../src/scanners/cache.js";

const cacheAt = (dir, options = {}) => createObservationCache({
  cacheDir: join(dir, ".varai/cache"), stacks: [], enabled: true, ...options,
});

test("cache miss returns null for unset content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    assert.equal(await cacheAt(dir).get("test.py", "x = 1"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("cache set + get round-trips observations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cache = cacheAt(dir);
    const observations = [{ kind: "env_var", name: "FOO", evidence: [{ file: "test.py" }], layer: "ast" }];
    await cache.set("test.py", "x = 1", observations);
    assert.deepEqual(await cache.get("test.py", "x = 1"), observations);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("cache key changes with different content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cache = cacheAt(dir);
    await cache.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    assert.equal(await cache.get("test.py", "x = 2"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("cache key changes with different stacks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const a = cacheAt(dir, { stacks: ["fastapi"] });
    await a.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    assert.equal(await cacheAt(dir, { stacks: ["react-vite"] }).get("test.py", "x = 1"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("cache key changes with different prefix fingerprint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const a = cacheAt(dir, { prefixFingerprint: "abc" });
    await a.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    assert.equal(await cacheAt(dir, { prefixFingerprint: "def" }).get("test.py", "x = 1"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("cache key changes with different extractor fingerprint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const a = cacheAt(dir, { extractorFingerprint: "a" });
    await a.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    assert.equal(await cacheAt(dir, { extractorFingerprint: "b" }).get("test.py", "x = 1"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("cache disabled returns null and does not write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cache = cacheAt(dir, { enabled: false });
    await cache.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    assert.equal(await cache.get("test.py", "x = 1"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("cache survives read-only FS (non-fatal)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    await writeFile(join(dir, "readonly"), "block");
    const cache = createObservationCache({ cacheDir: join(dir, "readonly", "cache"), stacks: [], enabled: true });
    await cache.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    assert.equal(await cache.get("test.py", "x = 1"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
