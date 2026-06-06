import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/runnable.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "varai-run-"));
  return dir;
}

test("extracts npm scripts from package.json", async () => {
  const dir = await setup();
  await writeFile(join(dir, "package.json"), JSON.stringify({
    scripts: { dev: "vite", build: "vite build", test: "vitest" }
  }));
  const facts = await extract(dir, ["package.json"]);
  assert.ok(facts.some((f) => f.kind === "script" && f.name === "npm run dev" && f.runner === "npm"));
  assert.ok(facts.some((f) => f.kind === "script" && f.name === "npm run build"));
  assert.ok(facts.some((f) => f.kind === "script" && f.name === "npm run test"));
});

test("extracts pyproject [project.scripts] entries", async () => {
  const dir = await setup();
  await writeFile(join(dir, "pyproject.toml"),
    "[project]\nname = \"myapp\"\n\n[project.scripts]\nmyapp-cli = \"myapp.cli:main\"\n");
  const facts = await extract(dir, ["pyproject.toml"]);
  assert.ok(facts.some((f) => f.kind === "script" && f.name === "myapp-cli" && f.runner === "python"));
});

test("extracts Makefile targets", async () => {
  const dir = await setup();
  await writeFile(join(dir, "Makefile"),
    "help:\n\t@echo usage\n\ntest:\n\tnpm test\n\nbuild: test\n\tnpm run build\n");
  const facts = await extract(dir, ["Makefile"]);
  assert.ok(facts.some((f) => f.kind === "script" && f.name === "make help" && f.runner === "make"));
  assert.ok(facts.some((f) => f.kind === "script" && f.name === "make test"));
  assert.ok(facts.some((f) => f.kind === "script" && f.name === "make build"));
});

test("does not emit Makefile variable assignments as targets", async () => {
  const dir = await setup();
  await writeFile(join(dir, "Makefile"), "FOO := bar\nBUILD_DIR := dist\nall:\n\techo done\n");
  const facts = await extract(dir, ["Makefile"]);
  assert.ok(!facts.some((f) => f.name === "make FOO"), "variable assignments not treated as targets");
  assert.ok(facts.some((f) => f.name === "make all"));
});

test("extracts services from docker-compose.yml", async () => {
  const dir = await setup();
  await writeFile(join(dir, "docker-compose.yml"),
    "services:\n  postgres:\n    image: postgres:15\n  backend:\n    build: .\n  redis:\n    image: redis\n");
  const facts = await extract(dir, ["docker-compose.yml"]);
  const services = facts.filter((f) => f.kind === "service");
  assert.deepEqual(services.map((f) => f.name).sort(), ["backend", "postgres", "redis"]);
  assert.ok(services.every((f) => f.source === "docker-compose"));
});

test("extracts Dockerfile as a service", async () => {
  const dir = await setup();
  await mkdir(join(dir, "services/docker"), { recursive: true });
  await writeFile(join(dir, "services/docker/Dockerfile.backend"), "FROM node:20\n");
  const facts = await extract(dir, ["services/docker/Dockerfile.backend"]);
  assert.ok(facts.some((f) => f.kind === "service" && f.name === "backend" && f.source === "dockerfile"));
});

test("deduplicates identical script names across manifests", async () => {
  const dir = await setup();
  await writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { test: "jest" } }));
  await mkdir(join(dir, "services/frontend"), { recursive: true });
  await writeFile(join(dir, "services/frontend/package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
  const facts = await extract(dir, ["package.json", "services/frontend/package.json"]);
  const testScripts = facts.filter((f) => f.name === "npm run test");
  assert.equal(testScripts.length, 1, "deduplicated to one npm run test");
});
