import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { extract } from "../src/scanners/extractors/react-vite.js";

test("parses source when Zustand state may be present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-skip-"));
  await writeFile(join(dir, "store.js"), `import { create } from 'zustand';\nconst useStore = create(() => ({ count: 0 }));\n`);
  const observations = await extract(dir, ["store.js"]);
  assert.ok(observations.some((item) => item.kind === "state_store"));
});

test("parses source when a routed screen may be present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "varai-skip-"));
  await writeFile(join(dir, "App.jsx"), `import { Route } from 'react-router-dom';\n<Route path="/home" element={<Home />} />\n`);
  const observations = await extract(dir, ["App.jsx"]);
  assert.ok(observations.some((item) => item.kind === "page" && item.name === "/home"));
});
