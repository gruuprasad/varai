import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/npm.js";

test("extracts npm packages from root package.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-npm-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({
    dependencies: { "react": "^18.0.0", "axios": "^1.6.0" },
    devDependencies: { "vite": "^5.0.0" }
  }));
  const facts = await extract(dir, ["package.json"]);
  const packages = facts.filter((f) => f.kind === "package");
  assert.ok(packages.some((p) => p.name === "react" && p.ecosystem === "npm"));
  assert.ok(packages.some((p) => p.name === "axios" && p.ecosystem === "npm"));
  assert.ok(packages.some((p) => p.name === "vite" && p.ecosystem === "npm"));
  assert.equal(packages[0].layer, "ast");
});

test("extracts npm packages from services/frontend/package.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-npm-"));
  await mkdir(join(dir, "services/frontend"), { recursive: true });
  await writeFile(join(dir, "services/frontend/package.json"), JSON.stringify({
    dependencies: { "zustand": "^4.0.0" }
  }));
  const facts = await extract(dir, ["services/frontend/package.json"]);
  assert.ok(facts.some((f) => f.kind === "package" && f.name === "zustand"));
});

test("ignores non-package.json files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-npm-"));
  await writeFile(join(dir, "main.py"), `print("hello")`);
  assert.equal((await extract(dir, ["main.py"])).length, 0);
});
