import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createFactCache } from "../src/scanners/cache.js";

test("cache miss returns null for unset content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cache = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: [], enabled: true });
    const result = await cache.get("test.py", "x = 1");
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache set + get round-trips facts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cache = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: [], enabled: true });
    const facts = [{ kind: "env_var", name: "FOO", evidence: [{ file: "test.py" }], layer: "ast" }];
    await cache.set("test.py", "x = 1", facts);
    const result = await cache.get("test.py", "x = 1");
    assert.deepEqual(result, facts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache key changes with different content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cache = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: [], enabled: true });
    await cache.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    const result = await cache.get("test.py", "x = 2");
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache key changes with different stacks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cacheA = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: ["fastapi"], enabled: true });
    await cacheA.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);

    const cacheB = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: ["react-vite"], enabled: true });
    const result = await cacheB.get("test.py", "x = 1");
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache key changes with different prefixFingerprint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cacheA = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: [], prefixFingerprint: "abc", enabled: true });
    await cacheA.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);

    const cacheB = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: [], prefixFingerprint: "def", enabled: true });
    const result = await cacheB.get("test.py", "x = 1");
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache key changes with different extractor fingerprint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cacheA = createFactCache({ cacheDir: join(dir, ".varai/cache"), extractorFingerprint: "a", enabled: true });
    await cacheA.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    const cacheB = createFactCache({ cacheDir: join(dir, ".varai/cache"), extractorFingerprint: "b", enabled: true });
    assert.equal(await cacheB.get("test.py", "x = 1"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache disabled returns null and does not write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    const cache = createFactCache({ cacheDir: join(dir, ".varai/cache"), stacks: [], enabled: false });
    await cache.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    const result = await cache.get("test.py", "x = 1");
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("cache survives read-only FS (non-fatal)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-cache-"));
  try {
    await writeFile(join(dir, "readonly"), "block");
    const cache = createFactCache({ cacheDir: join(dir, "readonly", "cache"), stacks: [], enabled: true });
    await cache.set("test.py", "x = 1", [{ kind: "a", name: "A", evidence: [] }]);
    const result = await cache.get("test.py", "x = 1");
    assert.equal(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
