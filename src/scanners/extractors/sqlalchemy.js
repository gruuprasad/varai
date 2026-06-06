import path from "node:path";
import { createScanContext } from "../context.js";
import { queryTree } from "../treesitter.js";

const SUPERCLASSES_FIELD = "superclasses";

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    if (/(?:^|\/)alembic\/versions\//.test(file) && path.extname(file) === ".py") {
      facts.push({ kind: "database_migration", name: path.basename(file), evidence: [{ file }], layer: "heuristic" });
      continue;
    }
    if (path.extname(file) !== ".py") continue;

    const tree = await ctx.tree(file, "python");
    if (!tree) continue;

    for (const { node } of await queryTree(tree, "python", "(class_definition) @cls")) {
      const nameNode = node.childForFieldName("name");
      const supersNode = node.childForFieldName(SUPERCLASSES_FIELD);
      if (!nameNode || !supersNode) continue;
      const name = nameNode.text;
      if (name === "Base") continue;
      if (!/\bBase\b/.test(supersNode.text)) continue;
      facts.push({
        kind: "db_model", name,
        evidence: [{ file, line: nameNode.startPosition.row + 1 }],
        layer: "ast"
      });
    }
  }
  return facts;
}
