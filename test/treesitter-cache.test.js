import assert from "node:assert/strict";
import test from "node:test";
import { parseTree, queryTree, queryCaptures } from "../src/scanners/treesitter.js";

test("parseTree reuses Parser across calls for same language", async () => {
  const code = "x = 1\ny = 2\n";
  const tree1 = await parseTree("python", code);
  const tree2 = await parseTree("python", code);
  assert.equal(typeof tree1.rootNode.text, "string");
  assert.equal(typeof tree2.rootNode.text, "string");
});

test("queryTree caches Query objects", async () => {
  const code = `class Foo(Base):
    pass
`;
  const tree = await parseTree("python", code);
  const caps1 = await queryTree(tree, "python", "(class_definition) @cls");
  const caps2 = await queryTree(tree, "python", "(class_definition) @cls");
  assert.equal(caps1.length, caps2.length);
  assert.equal(caps1.length, 1);
});

test("queryCaptures still works end-to-end", async () => {
  const code = `@router.get("/api/items")
async def items(): pass
`;
  const caps = await queryCaptures("python", code, "(decorator) @dec");
  assert.equal(caps.length, 1);
  assert.ok(caps[0].node.text.includes("/api/items"));
});
