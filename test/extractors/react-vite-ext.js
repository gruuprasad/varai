import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/react-vite.js";

test("extracts exported PascalCase components from components directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src/components"), { recursive: true });
  await writeFile(join(dir, "src/components/Header.jsx"), `export function Header() { return <header>Hello</header>; }`);
  const observations = await extract(dir, ["src/components/Header.jsx"]);
  assert.ok(observations.some((item) => item.kind === "component" && item.name === "Header"));
});

test("extracts exported const components from pages directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src/pages"), { recursive: true });
  await writeFile(join(dir, "src/pages/HomePage.tsx"), `export const HomePage = () => <div>Home</div>;`);
  const observations = await extract(dir, ["src/pages/HomePage.tsx"]);
  assert.ok(observations.some((item) => item.kind === "component" && item.name === "HomePage"));
});

test("ignores components outside supported UI source directories", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "random"), { recursive: true });
  await writeFile(join(dir, "random/SomeComponent.jsx"), `export function SomeComponent() { return null; }`);
  const observations = await extract(dir, ["random/SomeComponent.jsx"]);
  assert.equal(observations.filter((item) => item.kind === "component").length, 0);
});
