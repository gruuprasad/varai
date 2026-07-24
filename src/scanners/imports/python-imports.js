import { queryTree } from "../treesitter.js";
import { buildModuleMap, resolveModule } from "../behaviors/symbol-index.js";

// Collect raw Python import edges as a flat list. Each edge is one
// `(usageSiteSymbol -> importedSymbol)` pair recovered from a
// `from X import Y` statement whose module resolves to a scanned file.
//
// Shape (D-c):
//   { fromFile, fromSymbol, toFile, toSymbol, evidence: { file, line } }
//     fromSymbol = name of the nearest enclosing def/class, or null (module level).
//     toSymbol   = the imported name in the target module (aliases use the original name).
//     toFile     = the resolved target file (edges to unresolved/external modules are skipped).
//
// Attribution is not automatic: lift only emits a depends_on claim when BOTH
// endpoints resolve to owning Element symbols. Nested helpers and other
// non-Element enclosing names become coverage gaps, not guessed edges.
export async function collectPythonImports(files, ctx) {
  const pyFiles = files.filter((file) => file.endsWith(".py"));
  const fileSet = new Set(pyFiles);
  const modToFile = buildModuleMap(fileSet);
  const edges = [];

  for (const file of pyFiles) {
    const tree = await ctx.tree(file, "python");
    if (!tree) continue;
    for (const { node } of await queryTree(tree, "python", "(import_from_statement) @imp")) {
      const moduleNode = node.childForFieldName("module_name");
      const moduleName = moduleNode?.text;
      if (!moduleName) continue;
      const toFile = resolveModule(moduleName, file, modToFile, fileSet);
      if (!toFile) continue; // external / stdlib import — not our edge

      const fromSymbol = enclosingSymbol(node);
      const line = node.startPosition.row + 1;
      // The imported names are every named child except the module_name node
      // (and relative_import / wildcard_import markers, which importedName drops).
      for (const nameNode of node.namedChildren) {
        if (nameNode.startIndex === moduleNode.startIndex) continue;
        const toSymbol = importedName(nameNode);
        if (!toSymbol) continue;
        edges.push({ fromFile: file, fromSymbol, toFile, toSymbol, evidence: { file, line } });
      }
    }
  }
  return edges;
}

// The imported name resolved in the target module: for `X as Y`, that is X.
function importedName(nameNode) {
  if (nameNode.type === "aliased_import") return nameNode.childForFieldName("name")?.text ?? null;
  if (nameNode.type === "dotted_name") return nameNode.text;
  return null;
}

// Walk up to the first enclosing function/class definition; null at module level.
// For a class method that is the nearest def — returns the method name, not the class.
function enclosingSymbol(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "function_definition" || parent.type === "class_definition") {
      return parent.childForFieldName("name")?.text ?? null;
    }
    parent = parent.parent;
  }
  return null;
}
