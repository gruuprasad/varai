import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function detectStacks(repoPath) {
  const stacks = new Set();
  const [packageJson, pyprojectToml, requirementsTxt] =
    await Promise.all([
      tryRead(join(repoPath, "package.json")),
      tryRead(join(repoPath, "pyproject.toml")),
      tryRead(join(repoPath, "requirements.txt"))
    ]);

  if (packageJson !== null) {
    try {
      const parsed = JSON.parse(packageJson);
      const allDeps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      if ("vite" in allDeps || "react" in allDeps) {
        stacks.add("react-vite");
      }
    } catch { /* malformed package.json — skip */ }
  }

  if (pyprojectToml !== null) {
    stacks.add("python-common");
    if (/\bfastapi\b/i.test(pyprojectToml)) stacks.add("fastapi");
    if (/\bsqlalchemy\b/i.test(pyprojectToml)) stacks.add("sqlalchemy");
  }

  if (requirementsTxt !== null) {
    if (/^fastapi([=><!]|$)/im.test(requirementsTxt)) stacks.add("fastapi");
    if (/^sqlalchemy([=><!]|$)/im.test(requirementsTxt)) stacks.add("sqlalchemy");
    if (pyprojectToml === null) stacks.add("python-common");
  }

  return stacks;
}

async function tryRead(filePath) {
  try { return await readFile(filePath, "utf8"); }
  catch { return null; }
}
