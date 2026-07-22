const MODEL_RE = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;

/** Map Prisma client delegate names (camelCase) to model names (PascalCase). */
export function modelNamesFromPrisma(names) {
  const map = new Map();
  for (const name of names) {
    map.set(name[0].toLowerCase() + name.slice(1), name);
  }
  return map;
}

export async function extract(repoPath, files, ctx) {
  const facts = [];
  for (const file of files) {
    if (!file.endsWith(".prisma")) continue;
    const content = await ctx.read(file);
    if (!content || !content.includes("model ")) continue;
    for (const match of content.matchAll(MODEL_RE)) {
      const name = match[1];
      const line = content.slice(0, match.index).split("\n").length;
      facts.push({
        kind: "db_model",
        name,
        evidence: [{ file, line, symbol: name }],
        layer: "ast",
      });
    }
  }
  return facts;
}
