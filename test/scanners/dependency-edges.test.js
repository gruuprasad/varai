import assert from "node:assert/strict";
import test from "node:test";
import { resolveDependencyEdges, pythonScopedSubsystemKeys } from "../../src/scanners/lift/dependency-edges.js";

const elements = [
  { id: "element:A", evidence: [{ file: "app/a.py", line: 1, symbol: "alpha" }], implementationPath: [] },
  { id: "element:B", evidence: [{ file: "app/b.py", line: 2, symbol: "beta" }], implementationPath: [] },
  { id: "element:C", evidence: [{ file: "app/c.py", line: 3, symbol: "gamma" }], implementationPath: [] },
];

test("resolves both-endpoint edges into deduped depends_on claims", () => {
  const importEdges = [
    { fromFile: "app/a.py", fromSymbol: "alpha", toFile: "app/b.py", toSymbol: "beta", evidence: { file: "app/a.py", line: 5 } },
    { fromFile: "app/a.py", fromSymbol: "alpha", toFile: "app/c.py", toSymbol: "gamma", evidence: { file: "app/a.py", line: 6 } },
  ];
  const { claims, diagnostics } = resolveDependencyEdges({ importEdges, elements });
  assert.equal(claims.length, 2);
  assert.equal(diagnostics.length, 0);
  const first = claims.find((c) => c.target.id === "element:B");
  assert.equal(first.sourceId, "element:A");
  assert.equal(first.relation, "depends_on");
  assert.deepEqual(first.target, { kind: "reference", id: "element:B" });
  assert.equal(first.slot, "depends_on:element:B");
  assert.equal(first.capability, "arch.dependency");
  assert.equal(first.observationMethod, "ast");
  assert.equal(first.claimState, "observed");
});

test("dedupes edges for the same ordered pair, merging evidence", () => {
  const importEdges = [
    { fromFile: "app/a.py", fromSymbol: "alpha", toFile: "app/b.py", toSymbol: "beta", evidence: { file: "app/a.py", line: 5 } },
    { fromFile: "app/a.py", fromSymbol: "alpha", toFile: "app/b.py", toSymbol: "beta", evidence: { file: "app/a.py", line: 9 } },
  ];
  const { claims } = resolveDependencyEdges({ importEdges, elements });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].evidence.length, 2);
  assert.deepEqual(claims[0].evidence.map((e) => e.line).sort(), [5, 9]);
});

test("module-level import (fromSymbol null) is a diagnostic, not a claim", () => {
  const importEdges = [
    { fromFile: "app/a.py", fromSymbol: null, toFile: "app/b.py", toSymbol: "beta", evidence: { file: "app/a.py", line: 1 } },
  ];
  const { claims, diagnostics } = resolveDependencyEdges({ importEdges, elements });
  assert.equal(claims.length, 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "depends-on-unresolved");
  assert.equal(diagnostics[0].capability, "arch.dependency");
  assert.equal(diagnostics[0].severity, "warning");
});

test("unresolved endpoint (non-Element symbol) is a diagnostic, not a claim", () => {
  const importEdges = [
    { fromFile: "app/a.py", fromSymbol: "alpha", toFile: "app/z.py", toSymbol: "unknown", evidence: { file: "app/a.py", line: 4 } },
  ];
  const { claims, diagnostics } = resolveDependencyEdges({ importEdges, elements });
  assert.equal(claims.length, 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "depends-on-unresolved");
});

test("unresolved diagnostic is deduped into one carrying all evidence sites", () => {
  const importEdges = [
    { fromFile: "app/a.py", fromSymbol: null, toFile: "app/b.py", toSymbol: "beta", evidence: { file: "app/a.py", line: 1 } },
    { fromFile: "app/a.py", fromSymbol: "alpha", toFile: "app/z.py", toSymbol: "unknown", evidence: { file: "app/a.py", line: 4 } },
  ];
  const { diagnostics } = resolveDependencyEdges({ importEdges, elements });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].evidence.length, 2);
});

test("self-edges are dropped", () => {
  const importEdges = [
    { fromFile: "app/a.py", fromSymbol: "alpha", toFile: "app/a.py", toSymbol: "alpha", evidence: { file: "app/a.py", line: 5 } },
  ];
  const { claims, diagnostics } = resolveDependencyEdges({ importEdges, elements });
  assert.equal(claims.length, 0);
  assert.equal(diagnostics.length, 0);
});

test("collision keeps lexicographically smallest id and records a diagnostic", () => {
  const collidingElements = [
    { id: "element:Z", evidence: [{ file: "app/x.py", line: 1, symbol: "shared" }], implementationPath: [] },
    { id: "element:A", evidence: [{ file: "app/x.py", line: 1, symbol: "shared" }], implementationPath: [] },
    { id: "element:target", evidence: [{ file: "app/t.py", line: 1, symbol: "t" }], implementationPath: [] },
  ];
  const importEdges = [
    { fromFile: "app/x.py", fromSymbol: "shared", toFile: "app/t.py", toSymbol: "t", evidence: { file: "app/x.py", line: 5 } },
  ];
  const { claims, diagnostics } = resolveDependencyEdges({ importEdges, elements: collidingElements });
  assert.equal(claims.length, 1);
  assert.equal(claims[0].sourceId, "element:A");
  assert.ok(diagnostics.some((d) => d.code === "depends-on-symbol-collision"));
});

test("pythonScopedSubsystemKeys includes only subsystems with .py Element evidence", () => {
  const keys = pythonScopedSubsystemKeys([
    { subsystemKey: "api", evidence: [{ file: "routes.py", line: 1 }], implementationPath: [] },
    { subsystemKey: "ui", evidence: [{ file: "src/App.tsx", line: 1 }], implementationPath: [] },
    { subsystemKey: "data", evidence: [], implementationPath: [{ file: "models.PY", line: 2 }] },
    { subsystemKey: "cli", evidence: [{ file: "readme.md", line: 1 }], implementationPath: [] },
  ]);
  assert.deepEqual([...keys].sort(), ["api", "data"]);
});
