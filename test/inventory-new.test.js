import assert from "node:assert/strict";
import test from "node:test";
import { renderInventory } from "../src/reporters/inventory.js";

const FACTS = [
  { kind: "api_route",     name: "POST /api/auth/login",     evidence: [{ file: "routes/auth.py", line: 24 }], layer: "ast" },
  { kind: "package",       name: "fastapi",   evidence: [{ file: "pyproject.toml" }], layer: "ast", ecosystem: "python" },
  { kind: "package",       name: "react",     evidence: [{ file: "package.json" }],   layer: "ast", ecosystem: "npm" },
  { kind: "api_call",      name: "GET /api/projects",         evidence: [{ file: "src/api.js" }],       layer: "heuristic" },
  { kind: "component",     name: "Header",                    evidence: [{ file: "src/components/Header.jsx", line: 1 }], layer: "ast" },
  { kind: "hook",          name: "useAuth",                   evidence: [{ file: "src/hooks/useAuth.js" }], layer: "ast" },
  { kind: "settings_field",name: "DATABASE_URL",              evidence: [{ file: "config.py", line: 5 }], layer: "ast" },
  { kind: "env_var",       name: "VITE_API_URL",              evidence: [{ file: ".env" }], layer: "file" },
];

test("summary header appears when scan has summary and stacks", () => {
  const out = renderInventory({
    repoPath: "/x/app",
    scan: { facts: FACTS, summary: { fileCount: 5, factCount: 8, sectionCounts: { api_call: 1 } }, stacks: ["fastapi", "react-vite"] }
  });
  assert.ok(out.includes("| Files | 5 |"));
  assert.ok(out.includes("| Facts | 8 |"));
  assert.ok(out.includes("| Stacks | fastapi, react-vite |"));
});

test("summary header is defensive when summary is missing", () => {
  const out = renderInventory({ repoPath: "/x/app", scan: { facts: FACTS } });
  assert.ok(out.startsWith("# App Map — app\n"));
  assert.ok(!out.includes("| Files |"));
  assert.ok(!out.includes("| Facts |"));
});

test("summary header is defensive when stacks is missing", () => {
  const out = renderInventory({ repoPath: "/x/app", scan: { facts: FACTS, summary: { fileCount: 1, factCount: 1 } } });
  assert.ok(out.includes("| Files | 1 |"));
  assert.ok(out.includes("| Facts | 1 |"));
  assert.ok(!out.includes("| Stacks |"));
});

test("API Calls section rendered with count", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## API Calls (1)"));
  assert.ok(out.includes("GET /api/projects"));
});

test("Components section rendered with count", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Components (1)"));
  assert.ok(out.includes("Header"));
});

test("Components capped at 60 with note", () => {
  const components = Array.from({ length: 65 }, (_, i) => ({
    kind: "component", name: `Comp${i}`,
    evidence: [{ file: `src/components/Comp${i}.jsx` }], layer: "ast"
  }));
  const out = renderInventory({ repoPath: "/x", scan: { facts: components } });
  assert.ok(out.includes("(showing 60 of 65)"));
  assert.ok(out.includes("Comp0"));
  assert.ok(!out.includes("Comp63"));
});

test("Components under 60 have no cap note", () => {
  const components = Array.from({ length: 10 }, (_, i) => ({
    kind: "component", name: `Comp${i}`,
    evidence: [{ file: `src/components/Comp${i}.jsx` }], layer: "ast"
  }));
  const out = renderInventory({ repoPath: "/x", scan: { facts: components } });
  assert.ok(!out.includes("showing"));
});

test("Hooks section rendered with count", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Hooks (1)"));
  assert.ok(out.includes("useAuth"));
});

test("Settings Fields section rendered", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Settings Fields"));
  assert.ok(out.includes("DATABASE_URL"));
});

test("Packages grouped by ecosystem", () => {
  const out = renderInventory({ repoPath: "/x", scan: { facts: FACTS } });
  assert.ok(out.includes("## Packages"));
  assert.ok(out.includes("python: fastapi"));
  assert.ok(out.includes("npm: react"));
});

test("long name wraps to next line instead of column collision", () => {
  const longName = "GET /api/projects/verylongprojectid/items/specificallynameditems";
  const facts = [
    { kind: "api_route", name: longName, evidence: [{ file: "routes/projects.py", line: 42 }], layer: "ast" }
  ];
  const out = renderInventory({ repoPath: "/x", scan: { facts } });
  const lines = out.split("\n");
  const nameLine = lines.find((l) => l.includes(longName));
  assert.ok(nameLine);
  const locLine = lines[lines.indexOf(nameLine) + 1];
  assert.ok(locLine.includes("routes/projects.py:42"));
});
