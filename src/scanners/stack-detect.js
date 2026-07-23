import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function detectStacks(repoPath, files = []) {
  const stacks = new Set();
  // Always-on stack for extractors that aren't tied to a language/framework
  // (e.g. runnable artifacts: scripts, Dockerfiles, compose services).
  stacks.add("base");
  const [packageJson, frontendPackageJson, servicesFrontendPackageJson, pyprojectToml, requirementsTxt] =
    await Promise.all([
      tryRead(join(repoPath, "package.json")),
      tryRead(join(repoPath, "frontend/package.json")),
      tryRead(join(repoPath, "services/frontend/package.json")),
      tryRead(join(repoPath, "pyproject.toml")),
      tryRead(join(repoPath, "requirements.txt"))
    ]);

  for (const pkg of [packageJson, frontendPackageJson, servicesFrontendPackageJson]) {
    if (pkg === null) continue;
    try {
      const parsed = JSON.parse(pkg);
      const allDeps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      if (Object.keys(allDeps).length > 0) {
        stacks.add("npm");
      }
      if ("vite" in allDeps || "react" in allDeps) {
        stacks.add("react-vite");
      }
      if ("next" in allDeps) {
        stacks.add("nextjs");
      }
      if ("@prisma/client" in allDeps || "prisma" in allDeps) {
        stacks.add("prisma");
      }
      if (stacks.has("react-vite") || stacks.has("nextjs")) break;
    } catch { /* malformed package.json — skip */ }
  }

  if (files.some((file) => String(file).endsWith(".prisma"))) {
    stacks.add("prisma");
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
