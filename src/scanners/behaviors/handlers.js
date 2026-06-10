import { queryTree } from "../treesitter.js";

// Drive from existing api_route facts (doors already resolved). For each, open
// the file tree, find the decorated_definition whose decorator sits on the
// fact's evidence line, and return its function_definition as the handler node.
export async function findHandlers(routeFacts, ctx) {
  const handlers = [];
  const byFile = new Map();
  for (const fact of routeFacts) {
    const ev = fact.evidence?.[0];
    if (!ev) continue;
    if (!byFile.has(ev.file)) byFile.set(ev.file, []);
    byFile.get(ev.file).push(fact);
  }

  for (const [file, facts] of byFile) {
    const tree = await ctx.tree(file, "python");
    if (!tree) continue;
    const decorated = await queryTree(tree, "python", "(decorated_definition) @dd");

    // Map decorator line -> function_definition node.
    const lineToFn = new Map();
    for (const { node } of decorated) {
      const fn = node.childForFieldName("definition");
      if (!fn || fn.type !== "function_definition") continue;
      for (const child of node.namedChildren) {
        if (child.type === "decorator") {
          lineToFn.set(child.startPosition.row + 1, fn);
        }
      }
    }

    for (const fact of facts) {
      const handlerNode = lineToFn.get(fact.evidence[0].line);
      if (!handlerNode) continue;
      const [method, ...rest] = fact.name.split(" ");
      handlers.push({
        file,
        handlerNode,
        door: { method, path: rest.join(" "), evidence: { ...fact.evidence[0] } },
      });
    }
  }
  return handlers;
}
