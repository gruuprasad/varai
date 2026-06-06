import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../src/scanners/extractors/react-vite.js";

test("produces api_call facts without tree parse when no JSX/zustand present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-skip-"));
  await writeFile(join(dir, "api.js"), `function getUsers() {
  return fetch("/api/users").then(res => res.json());
}
`);
  const facts = await extract(dir, ["api.js"]);
  assert.ok(facts.some((f) => f.kind === "api_call" && f.name === "GET /api/users"));
  assert.equal(facts.filter((f) => f.kind === "state_store").length, 0);
  assert.equal(facts.filter((f) => f.kind === "page").length, 0);
});

test("produces VITE_ env var facts without tree parse", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-skip-"));
  await writeFile(join(dir, "config.js"), `const API_URL = import.meta.env.VITE_API_URL;`);
  const facts = await extract(dir, ["config.js"]);
  assert.ok(facts.some((f) => f.kind === "env_var" && f.name === "VITE_API_URL"));
});

test("still parses tree for zustand store detection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-skip-"));
  await writeFile(join(dir, "store.js"), `import { create } from 'zustand';
const useStore = create((set) => ({ count: 0 }));
`);
  const facts = await extract(dir, ["store.js"]);
  assert.ok(facts.some((f) => f.kind === "state_store"));
});

test("still parses tree for JSX Route detection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-skip-"));
  await writeFile(join(dir, "App.jsx"), `import { Route } from 'react-router-dom';
<Route path="/home" element={<Home />} />
`);
  const facts = await extract(dir, ["App.jsx"]);
  assert.ok(facts.some((f) => f.kind === "page" && f.name === "/home"));
});
