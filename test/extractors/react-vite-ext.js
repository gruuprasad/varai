import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/react-vite.js";

test("extracts fetch api calls with string literal URLs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await writeFile(join(dir, "api.js"), `function getUsers() {
  return fetch("/api/users").then(res => res.json());
}
`);
  const facts = await extract(dir, ["api.js"]);
  assert.ok(facts.some((f) => f.kind === "api_call" && f.name === "GET /api/users"));
});

test("extracts axios.method api calls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await writeFile(join(dir, "api.js"), `import axios from 'axios';
axios.post("/api/auth/login", { email, password });
axios.get("/api/projects");
`);
  const facts = await extract(dir, ["api.js"]);
  assert.ok(facts.some((f) => f.kind === "api_call" && f.name === "POST /api/auth/login"));
  assert.ok(facts.some((f) => f.kind === "api_call" && f.name === "GET /api/projects"));
});

test("extracts axios(url) calls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await writeFile(join(dir, "api.js"), `axios("/api/health");`);
  const facts = await extract(dir, ["api.js"]);
  assert.ok(facts.some((f) => f.kind === "api_call" && f.name === "GET /api/health"));
});

test("extracts VITE_ env vars from import.meta.env", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await writeFile(join(dir, "config.js"), `const API_URL = import.meta.env.VITE_API_URL;
const MODE = import.meta.env.VITE_MODE;
`);
  const facts = await extract(dir, ["config.js"]);
  const envVars = facts.filter((f) => f.kind === "env_var");
  assert.ok(envVars.some((e) => e.name === "VITE_API_URL"));
  assert.ok(envVars.some((e) => e.name === "VITE_MODE"));
});

test("extracts exported PascalCase components from components/ dir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src/components"), { recursive: true });
  await writeFile(join(dir, "src/components/Header.jsx"), `export function Header() {
  return <header>Hello</header>;
}
`);
  const facts = await extract(dir, ["src/components/Header.jsx"]);
  assert.ok(facts.some((f) => f.kind === "component" && f.name === "Header"));
});

test("extracts exported const components from pages/ dir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src/pages"), { recursive: true });
  await writeFile(join(dir, "src/pages/HomePage.tsx"), `export const HomePage = () => <div>Home</div>;`);
  const facts = await extract(dir, ["src/pages/HomePage.tsx"]);
  assert.ok(facts.some((f) => f.kind === "component" && f.name === "HomePage"));
});

test("extracts exported hooks from hooks/ dir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src/hooks"), { recursive: true });
  await writeFile(join(dir, "src/hooks/useAuth.js"), `export function useAuth() {
  return { user: null };
}
`);
  const facts = await extract(dir, ["src/hooks/useAuth.js"]);
  assert.ok(facts.some((f) => f.kind === "hook" && f.name === "useAuth"));
});

test("ignores non-exported functions outside component scope", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await writeFile(join(dir, "helper.jsx"), `function NotExported() { return null; }`);
  const facts = await extract(dir, ["helper.jsx"]);
  assert.equal(facts.filter((f) => f.kind === "component" || f.kind === "hook").length, 0);
});

test("ignores exported components outside component/pages/hooks dirs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "random"), { recursive: true });
  await writeFile(join(dir, "random/SomeComponent.jsx"), `export function SomeComponent() { return null; }`);
  const facts = await extract(dir, ["random/SomeComponent.jsx"]);
  assert.equal(facts.filter((f) => f.kind === "component").length, 0);
});
