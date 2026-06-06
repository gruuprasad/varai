import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { dedupeFacts } from "../utils.js";

const ENV_RE = /os\.(?:environ\[["']|environ\.get\s*\(\s*["']|getenv\s*\(\s*["'])([A-Z][A-Z0-9_]*)["']/g;

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

  const poetrySection = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/);
  if (poetrySection) {
    for (const m of poetrySection[1].matchAll(/^([a-z][a-z0-9_-]*)\s*=/gim)) {
      const name = m[1].toLowerCase();
      if (name === "python") continue;
      facts.push({ kind: "package", name, evidence: [{ file }], layer: "heuristic" });
    }
  }

  const projectSection = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/i);
  if (projectSection) {
    for (const m of projectSection[1].matchAll(/["']([a-z][a-z0-9_-]*)[>=<![ \]"']/gim)) {
      facts.push({ kind: "package", name: m[1].toLowerCase(), evidence: [{ file }], layer: "heuristic" });
    }
  }

  return facts;
}

async function fromPythonEnvVars(repoPath, file) {
  try {
    const abs = path.join(repoPath, file);
    const s = await stat(abs);
    if (s.size > 500_000) return [];
    const content = await readFile(abs, "utf8");
    const facts = [];
    for (const m of content.matchAll(ENV_RE)) {
      facts.push({ kind: "env_var", name: m[1], evidence: [{ file }], layer: "heuristic" });
    }
    return facts;
  } catch { return []; }
}
