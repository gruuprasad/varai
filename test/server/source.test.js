import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readSourceSnippet } from "../../src/server/source.js";

const repo = path.resolve("test/fixtures/anchor-lift/base");

test("returns the focus line with surrounding context", () => {
  const snippet = readSourceSnippet(repo, "src/components/BuildingToolbar.tsx", 2);
  assert.equal(snippet.file, "src/components/BuildingToolbar.tsx");
  assert.equal(snippet.focusLine, 2);
  assert.equal(snippet.startLine, 1);
  assert.ok(snippet.lines.length >= 3);
  assert.ok(snippet.lines.some((line) => line.includes("deleteStorey")));
});

test("clamps an out-of-range line instead of failing", () => {
  const snippet = readSourceSnippet(repo, "src/components/BuildingToolbar.tsx", 9999);
  assert.ok(snippet.focusLine <= snippet.startLine + snippet.lines.length - 1);
});

test("rejects paths that escape the repository root", () => {
  assert.throws(() => readSourceSnippet(repo, "../../../package.json", 1));
  assert.throws(() => readSourceSnippet(repo, "/etc/hostname", 1));
});

test("rejects missing files", () => {
  assert.throws(() => readSourceSnippet(repo, "src/nope.tsx", 1));
});
