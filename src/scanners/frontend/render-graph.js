// Deterministic screen -> surface containment. A surface is contained by a
// screen only when a JSX-usage/import chain from the route's rendered
// component provably reaches the surface's defining file. Unresolvable
// chains produce nothing; they never fall back to name or path matching.
import path from "node:path";

const LANG_FOR_EXT = { ".js": "javascript", ".jsx": "javascript", ".ts": "tsx", ".tsx": "tsx" };
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function resolveImport(fromFile, specifier, fileSet) {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.posix.join(base, `index${ext}`))];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

async function parseFrontendFiles(files, ctx) {
  const fileSet = new Set(files);
  const parsed = new Map();
  for (const file of files) {
    const lang = LANG_FOR_EXT[path.extname(file)];
    if (!lang) continue;
    const tree = await ctx.tree(file, lang);
    if (!tree) continue;
    const imports = new Map();
    const jsxUses = [];
    walk(tree.rootNode, (node) => {
      if (node.type === "import_statement") {
        const sourceNode = node.childForFieldName("source");
        const target = sourceNode ? resolveImport(file, sourceNode.text.slice(1, -1), fileSet) : null;
        if (!target) return;
        walk(node, (child) => {
          if (child.type === "import_specifier") {
            const name = child.childForFieldName("name")?.text;
            const alias = child.childForFieldName("alias")?.text ?? name;
            if (name) imports.set(alias, target);
          }
          if (child.type === "import_clause" && child.firstChild?.type === "identifier") {
            imports.set(child.firstChild.text, target);
          }
        });
      }
      if (node.type === "jsx_opening_element" || node.type === "jsx_self_closing_element") {
        const name = node.childForFieldName("name")?.text;
        if (name && /^[A-Z]/.test(name)) {
          jsxUses.push({ name, line: node.startPosition.row + 1, start: node.startIndex, end: node.endIndex });
        }
      }
    });
    parsed.set(file, { imports, jsxUses });
  }
  return parsed;
}

export async function traceScreenContainment(files, ctx, pageObservations, surfaces) {
  const parsed = await parseFrontendFiles(files, ctx);
  const surfaceIndex = new Map(surfaces.map((item) => [`${item.file} ${item.component}`, item]));
  const found = new Map();

  for (const page of pageObservations) {
    const routeFile = page.evidence?.[0]?.file;
    const routeLine = page.evidence?.[0]?.line;
    const routeInfo = parsed.get(routeFile);
    if (!routeInfo || !routeLine) continue;

    const routeNode = routeInfo.jsxUses.find((use) => use.name === "Route" && use.line === routeLine);
    if (!routeNode) continue;
    const rendered = routeInfo.jsxUses.find((use) => use.name !== "Route" &&
      use.start > routeNode.start && use.end <= routeNode.end);
    if (!rendered) continue;
    // Rendered component resolved through the route file's imports, falling
    // back to the route file itself when the component is defined locally.
    const startFile = routeInfo.imports.get(rendered.name) ?? routeFile;

    const queue = [startFile];
    const visited = new Set(queue);
    while (queue.length) {
      const current = queue.shift();
      const info = parsed.get(current);
      if (!info) continue;
      for (const use of info.jsxUses) {
        const definingFile = info.imports.get(use.name) ?? current;
        const surface = surfaceIndex.get(`${definingFile} ${use.name}`);
        if (surface) {
          const key = `${page.name} ${use.name}`;
          const entry = found.get(key) ?? { screen: String(page.name), surfaceKey: use.name, evidence: [] };
          if (!entry.evidence.some((item) => item.file === current && item.line === use.line)) {
            entry.evidence.push({ file: current, line: use.line });
          }
          found.set(key, entry);
        }
        const next = info.imports.get(use.name);
        if (next && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  return [...found.values()]
    .map((entry) => ({ ...entry, evidence: [...entry.evidence].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) }))
    .sort((a, b) => a.screen.localeCompare(b.screen) || a.surfaceKey.localeCompare(b.surfaceKey));
}
