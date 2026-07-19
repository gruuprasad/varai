import assert from "node:assert/strict";
import test from "node:test";
import { createImplementationGraph } from "../../src/scanners/lift/implementation-graph.js";

test("implementation graph returns deterministic bounded paths", () => {
  const graph = createImplementationGraph();
  for (const symbol of ["route", "helper", "effect"]) {
    graph.addNode({ id: symbol, kind: symbol, file: "app.py", symbol });
  }
  graph.addEdge({ from: "route", to: "helper", kind: "calls", evidence: [{ file: "app.py", line: 2 }] });
  graph.addEdge({ from: "helper", to: "effect", kind: "targets", evidence: [{ file: "app.py", line: 3 }] });
  graph.addEdge({ from: "effect", to: "route", kind: "cycle", evidence: [] });

  assert.deepEqual(graph.findPath("route", "effect").map((node) => node.id), ["route", "helper", "effect"]);
  assert.equal(graph.diagnostics().length, 0);
});

test("implementation graph reports budget exhaustion", () => {
  const graph = createImplementationGraph({ workBudget: 1 });
  graph.addNode({ id: "one", kind: "function", file: "a.py", symbol: "one" });
  graph.addNode({ id: "two", kind: "function", file: "a.py", symbol: "two" });
  assert.equal(graph.stats().exhausted, true);
  assert.equal(graph.diagnostics()[0].code, "implementation-graph-budget-exhausted");
});
