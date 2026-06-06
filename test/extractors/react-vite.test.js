import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../../src/scanners/extractors/react-vite.js";

test("extracts Zustand store from file in store/ with create() call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src/store"), { recursive: true });
  await writeFile(join(dir, "src/store/planStore.js"), `import { create } from 'zustand';
const usePlanStore = create((set) => ({ plans: [] }));
export default usePlanStore;
`);
  const facts = await extract(dir, ["src/store/planStore.js"]);
  const stores = facts.filter((f) => f.kind === "state_store");
  assert.equal(stores.length, 1);
  assert.equal(stores[0].name, "planStore");
  assert.equal(stores[0].layer, "ast");
  assert.equal(stores[0].evidence[0].file, "src/store/planStore.js");
});

test("extracts Zustand store outside store/ when zustand import + create() both present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/authState.ts"), `import { create } from 'zustand';
export const useAuth = create(() => ({ user: null }));
`);
  const facts = await extract(dir, ["src/authState.ts"]);
  assert.ok(facts.some((f) => f.kind === "state_store" && f.name === "authState" && f.layer === "ast"));
});

test("extracts JSX self-closing Route path attributes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src/App.jsx"), `import { Route } from 'react-router-dom';
function App() {
  return (
    <>
      <Route path="/projects" element={<Projects />} />
      <Route path="/plans/:id" element={<Plan />} />
    </>
  );
}
`);
  const facts = await extract(dir, ["src/App.jsx"]);
  const pages = facts.filter((f) => f.kind === "page");
  assert.ok(pages.some((p) => p.name === "/projects"));
  assert.ok(pages.some((p) => p.name === "/plans/:id"));
  assert.equal(pages[0].layer, "ast");
});

test("ignores non-JS/TS files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-react-"));
  await writeFile(join(dir, "styles.css"), `create() {}`);
  assert.equal((await extract(dir, ["styles.css"])).length, 0);
});
