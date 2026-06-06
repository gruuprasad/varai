import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function detectStacks(repoPath) {
  const stacks = new Set();
  const [packageJson, pyprojectToml, requirementsTxt, nextConfigJs, nextConfigTs, nextConfigMjs] =
    await Promise.all([
      tryRead(join(repoPath, "package.json")),
      tryRead(join(repoPath, "pyproject.toml")),
      tryRead(join(repoPath, "requirements.txt")),
      tryRead(join(repoPath, "next.config.js")),
      tryRead(join(repoPath, "next.config.ts")),
      tryRead(join(repoPath, "next.config.mjs"))
    ]);

  const hasNextConfig = nextConfigJs !== null || nextConfigTs !== null || nextConfigMjs !== null;

  if (packageJson !== null) {
    try {
      const parsed = JSON.parse(packageJson);
      const allDeps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      if (hasNextConfig || "next" in allDeps) {
        stacks.add("nextjs");
      } else if ("vite" in allDeps || "react" in allDeps) {
        stacks.add("react-vite");
      }
    } catch { /* malformed package.json — skip */ }
  } else if (hasNextConfig) {
    stacks.add("nextjs");
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
