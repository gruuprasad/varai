import path from "node:path";
import { createScanContext } from "../context.js";
import { dedupeFacts } from "../utils.js";

// Extracts "how do I run this" facts — the operational surface of the repo:
//   - `script`  : npm scripts, pyproject [project.scripts] / poetry scripts,
//                 Makefile targets
//   - `service` : docker-compose services, Dockerfiles
//
// Regex/line based by design: compose and Makefiles have no tree-sitter grammar
// bundled, and the signals here (top-level keys, target labels) are shallow
// enough that line scanning is reliable and cheap. package.json/pyproject use
// JSON.parse / a small TOML scan.

export async function extract(repoPath, files, ctx = createScanContext(repoPath)) {
  const facts = [];
  for (const file of files) {
    const base = path.basename(file);

    if (base === "package.json") {
      facts.push(...await fromPackageJson(file, ctx));
    } else if (base === "pyproject.toml") {
      facts.push(...await fromPyproject(file, ctx));
    } else if (base === "Makefile") {
      facts.push(...await fromMakefile(file, ctx));
    } else if (base === "docker-compose.yml" || base === "docker-compose.yaml" ||
               base === "compose.yml" || base === "compose.yaml") {
      facts.push(...await fromCompose(file, ctx));
    } else if (base === "Dockerfile" || base.startsWith("Dockerfile.")) {
      facts.push(...fromDockerfile(file));
    }
  }
  return dedupeFacts(facts);
}

async function fromPackageJson(file, ctx) {
  const content = await ctx.read(file);
  if (!content) return [];
  const facts = [];
  try {
    const parsed = JSON.parse(content);
    for (const name of Object.keys(parsed.scripts ?? {})) {
      facts.push(scriptFact(`npm run ${name}`, file, "npm"));
    }
  } catch { /* bad JSON */ }
  return facts;
}

async function fromPyproject(file, ctx) {
  const content = await ctx.read(file);
  if (!content) return [];
  const facts = [];
  // Scan only the [project.scripts] / [tool.poetry.scripts] tables. A light
  // section walk avoids pulling in a TOML parse for what is a flat key list.
  let inScripts = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inScripts = line === "[project.scripts]" || line === "[tool.poetry.scripts]";
      continue;
    }
    if (!inScripts) continue;
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
    if (m) facts.push(scriptFact(m[1], file, "python"));
  }
  return facts;
}

async function fromMakefile(file, ctx) {
  const content = await ctx.read(file);
  if (!content) return [];
  const facts = [];
  for (const raw of content.split("\n")) {
    // A target is a line-initial name followed by a colon, not a variable
    // assignment (`X :=`) or a recipe line (tab-indented).
    const m = raw.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:(?!=)/);
    if (m && !raw.startsWith("\t")) {
      facts.push(scriptFact(`make ${m[1]}`, file, "make"));
    }
  }
  return facts;
}

async function fromCompose(file, ctx) {
  const content = await ctx.read(file);
  if (!content) return [];
  const facts = [];
  const lines = content.split("\n");
  let inServices = false;
  let servicesIndent = -1;
  for (const raw of lines) {
    if (/^\s*#/.test(raw) || raw.trim() === "") continue;
    const indent = raw.length - raw.trimStart().length;
    const keyMatch = raw.match(/^(\s*)([A-Za-z0-9._-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const key = keyMatch[2];

    if (!inServices) {
      if (indent === 0 && key === "services") {
        inServices = true;
        servicesIndent = -1; // set on first child
      }
      continue;
    }
    // A top-level key at indent 0 ends the services block.
    if (indent === 0) { inServices = false; continue; }
    if (servicesIndent === -1) servicesIndent = indent;
    // Direct children of `services:` are service names.
    if (indent === servicesIndent) {
      facts.push(serviceFact(key, file, "docker-compose"));
    }
  }
  return facts;
}

function fromDockerfile(file) {
  // The Dockerfile suffix (Dockerfile.backend -> backend) names the image role;
  // a bare Dockerfile maps to the repo/dir it sits in.
  const base = path.basename(file);
  const suffix = base.startsWith("Dockerfile.") ? base.slice("Dockerfile.".length) : null;
  const name = suffix ?? (path.dirname(file) === "." ? "Dockerfile" : `${path.dirname(file)}/Dockerfile`);
  return [serviceFact(name, file, "dockerfile")];
}

function scriptFact(name, file, runner) {
  return { kind: "script", name, runner, evidence: [{ file }], layer: "file" };
}

function serviceFact(name, file, source) {
  return { kind: "service", name, source, evidence: [{ file }], layer: "file" };
}
