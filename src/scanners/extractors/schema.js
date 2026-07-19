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
  const classes = [];
  for (const file of files) {
    if (path.extname(file) !== ".py") continue;
    const content = await ctx.read(file);
    if (!content) continue;
    if (!content.includes("class ")) continue;

    const tree = await ctx.tree(file, "python");
    if (!tree) continue;

    for (const { node } of await queryTree(tree, "python", "(class_definition) @cls")) {
      const supers = node.childForFieldName("superclasses");
      const nameNode = node.childForFieldName("name");
      if (!nameNode || !supers) continue;
      classes.push({
        name: nameNode.text,
        bases: baseNames(supers.text),
        file,
        line: nameNode.startPosition.row + 1,
      });
    }
  }

  const schemaNames = new Set(classes.filter((item) => item.bases.includes("BaseModel")).map((item) => item.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of classes) {
      if (schemaNames.has(item.name) || !item.bases.some((base) => schemaNames.has(base))) continue;
      schemaNames.add(item.name);
      changed = true;
    }
  }

  return classes
    .filter((item) => schemaNames.has(item.name))
    .map((item) => ({
        kind: "schema",
        name: item.name,
        evidence: [{ file: item.file, line: item.line }],
        layer: "ast",
      }))
    .sort((a, b) => a.evidence[0].file.localeCompare(b.evidence[0].file) || a.evidence[0].line - b.evidence[0].line);
}

function baseNames(value) {
  return [...String(value).matchAll(/[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g)]
    .map((match) => match[0].split(".").at(-1));
}
