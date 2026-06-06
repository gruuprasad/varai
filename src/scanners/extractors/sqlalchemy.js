import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { queryCaptures } from "../treesitter.js";

const SUPERCLASSES_FIELD = "superclasses";

export async function extract(repoPath, files) {
  const facts = [];
  for (const file of files) {
    if (/(?:^|\/)alembic\/versions\//.test(file) && path.extname(file) === ".py") {
      facts.push({ kind: "database_migration", name: path.basename(file), evidence: [{ file }], layer: "heuristic" });
      continue;
    }
    if (path.extname(file) !== ".py") continue;

    let content;
    try {
      const s = await stat(path.join(repoPath, file));
      if (s.size > 500_000) continue;
      content = await readFile(path.join(repoPath, file), "utf8");
    } catch { continue; }

    for (const { node } of await queryCaptures("python", content, "(class_definition) @cls")) {
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
