import path from "node:path";
import { createScanContext } from "../context.js";
import { dedupeFacts } from "../utils.js";
import { queryTree } from "../treesitter.js";

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    if (path.basename(file) === "pyproject.toml") {
      facts.push(...await fromPyproject(repoPath, file, ctx));
    } else if (path.extname(file) === ".py") {
      const content = await ctx.read(file);
      if (!content) continue;
      if (content.includes("os.environ") || content.includes("os.getenv")) {
        facts.push(...await fromPythonEnvVars(file, ctx));
      }
      if (content.includes("BaseSettings")) {
        facts.push(...await fromPythonSettings(file, ctx));
      }
    } else if (file.startsWith(".env") || path.basename(file).startsWith(".env.")) {
      facts.push(...await fromEnvFile(repoPath, file, ctx));
    }
  }
  return dedupeFacts(facts);
}

async function fromPyproject(repoPath, file, ctx) {
  const tree = await ctx.tree(file, "toml");
  if (!tree) return [];

  const facts = [];
  try {
    for (const tableNode of tree.rootNode.namedChildren) {
      if (tableNode.type !== "table") continue;
      const header = tableKey(tableNode);
      if (!header) continue;

      if (header === "tool.poetry.dependencies") {
        for (const pairNode of tableNode.namedChildren) {
          if (pairNode.type !== "pair") continue;
          const name = pairName(pairNode);
          if (!name || name === "python") continue;
          facts.push({ kind: "package", name: name.toLowerCase(), evidence: [{ file }], layer: "ast", ecosystem: "python" });
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
                  facts.push({ kind: "package", name: name.toLowerCase(), evidence: [{ file }], layer: "ast", ecosystem: "python" });
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

async function fromPythonEnvVars(file, ctx) {
  const tree = await ctx.tree(file, "python");
  if (!tree) return [];

  const facts = [];

  for (const { node } of await queryTree(tree, "python", "(subscript) @sub")) {
    const m = node.text.match(/^os\.environ\[["']([A-Z][A-Z0-9_]*)["']\]/);
    if (m) {
      facts.push({ kind: "env_var", name: m[1], evidence: [{ file }], layer: "ast" });
    }
  }

  for (const { node } of await queryTree(tree, "python", "(call) @call")) {
    const m = node.text.match(/^os\.(?:getenv|environ\.get)\s*\(\s*["']([A-Z][A-Z0-9_]*)["']/);
    if (m) {
      facts.push({ kind: "env_var", name: m[1], evidence: [{ file }], layer: "ast" });
    }
  }

  return facts;
}

async function fromPythonSettings(file, ctx) {
  const tree = await ctx.tree(file, "python");
  if (!tree) return [];

  const facts = [];
  for (const { node } of await queryTree(tree, "python", "(class_definition) @cls")) {
    const supersNode = node.childForFieldName("superclasses");
    if (!supersNode) continue;
    if (!/\bBaseSettings\b/.test(supersNode.text)) continue;

    const bodyNode = node.childForFieldName("body");
    if (!bodyNode) continue;
    for (const child of bodyNode.namedChildren) {
      if (child.type !== "expression_statement") continue;
      const assignNode = child.namedChildren[0];
      if (assignNode?.type !== "assignment") continue;
      const leftNode = assignNode.namedChildren[0];
      if (leftNode?.type !== "identifier") continue;
      facts.push({
        kind: "settings_field",
        name: leftNode.text,
        evidence: [{ file, line: leftNode.startPosition.row + 1 }],
        layer: "ast"
      });
    }
  }

  return facts;
}

async function fromEnvFile(repoPath, file, ctx) {
  const content = await ctx.read(file);
  if (!content) return [];

  const facts = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (m) {
      facts.push({
        kind: "env_var", name: m[1],
        evidence: [{ file }], layer: "file"
      });
    }
  }
  return facts;
}

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
