import path from "node:path";
import { createScanContext } from "../context.js";
import { queryTree } from "../treesitter.js";

// Extracts Pydantic request/response schemas (DTOs) — the API's data contract,
// distinct from db_model (persistence). A `schema` fact is any class whose base
// list includes BaseModel. Field extraction is intentionally omitted at this
// "inventory" level; we record the schema name and location.
//
// Reuses the (class_definition) query already used by python-common/sqlalchemy.

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    if (path.extname(file) !== ".py") continue;
    const content = await ctx.read(file);
    if (!content) continue;
    // Cheap pre-guard: no BaseModel mention -> no Pydantic schema possible.
    if (!content.includes("BaseModel")) continue;

    const tree = await ctx.tree(file, "python");
    if (!tree) continue;

    for (const { node } of await queryTree(tree, "python", "(class_definition) @cls")) {
      const supers = node.childForFieldName("superclasses");
      if (!supers || !/\bBaseModel\b/.test(supers.text)) continue;
      const nameNode = node.childForFieldName("name");
      if (!nameNode) continue;
      facts.push({
        kind: "schema",
        name: nameNode.text,
        evidence: [{ file, line: nameNode.startPosition.row + 1 }],
        layer: "ast",
      });
    }
  }
  return facts;
}
