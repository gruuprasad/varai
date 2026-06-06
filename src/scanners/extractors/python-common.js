import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import Parser from "web-tree-sitter";
import { dedupeFacts } from "../utils.js";
import { queryCaptures, loadLanguage } from "../treesitter.js";

export async function extract(repoPath, files) {
  const facts = [];
  for (const file of files) {
    if (path.basename(file) === "pyproject.toml") {
      facts.push(...await fromPyproject(repoPath, file));
    } else if (path.extname(file) === ".py") {
      facts.push(...await fromPythonEnvVars(repoPath, file));
    }
  }
  return dedupeFacts(facts);
}

async function fromPyproject(repoPath, file) {
  let content;
  try { content = await readFile(path.join(repoPath, file), "utf8"); }
  catch { return []; }

  const facts = [];
  try {
    const Lang = await loadLanguage("toml");
    const parser = new Parser();
    parser.setLanguage(Lang);
    const tree = parser.parse(content);

    for (const tableNode of tree.rootNode.namedChildren) {
      if (tableNode.type !== "table") continue;
      const header = tableKey(tableNode);
      if (!header) continue;

      if (header === "tool.poetry.dependencies") {
        for (const pairNode of tableNode.namedChildren) {
          if (pairNode.type !== "pair") continue;
          const name = pairName(pairNode);
          if (!name || name === "python") continue;
          facts.push({ kind: "package", name: name.toLowerCase(), evidence: [{ file }], layer: "ast" });
        }
      } else if (header === "project") {
        for (const pairNode of tableNode.namedChildren) {
          if (pairNode.type !== "pair") continue;
          const pk = pairName(pairNode);
          if (pk !== "dependencies") continue;
          for (const child of pairNode.namedChildren) {
            if (child.type === "array") {
              for (const str of child.namedChildren) {
                if (str.type !== "string") continue;
                const name = stringContent(str);
                if (name) {
                  facts.push({ kind: "package", name: name.toLowerCase(), evidence: [{ file }], layer: "ast" });
                }
              }
            }
          }
        }
      }
    }
  } catch { /* unparseable TOML */ }

  return facts;
}

async function fromPythonEnvVars(repoPath, file) {
  try {
    const abs = path.join(repoPath, file);
    const s = await stat(abs);
    if (s.size > 500_000) return [];
    const content = await readFile(abs, "utf8");

    const facts = [];

    for (const { node } of await queryCaptures("python", content, "(subscript) @sub")) {
      const m = node.text.match(/^os\.environ\[["']([A-Z][A-Z0-9_]*)["']\]/);
      if (m) {
        facts.push({ kind: "env_var", name: m[1], evidence: [{ file }], layer: "ast" });
      }
    }

    for (const { node } of await queryCaptures("python", content, "(call) @call")) {
      const m = node.text.match(/^os\.(?:getenv|environ\.get)\s*\(\s*["']([A-Z][A-Z0-9_]*)["']/);
      if (m) {
        facts.push({ kind: "env_var", name: m[1], evidence: [{ file }], layer: "ast" });
      }
    }

    return facts;
  } catch { return []; }
}

// ── TOML helpers ───────────────────────────────────────────

function tableKey(tableNode) {
  for (const child of tableNode.namedChildren) {
    if (child.type === "dotted_key" || child.type === "bare_key") {
      return child.text;
    }
  }
  return null;
}

function pairName(pairNode) {
  for (const child of pairNode.namedChildren) {
    if (child.type === "bare_key") return child.text;
  }
  return null;
}

function stringContent(strNode) {
  const text = strNode.text.replace(/^["']|["']$/g, "");
  const m = text.match(/^([a-z][a-z0-9_-]*)/);
  return m ? m[1] : null;
}
