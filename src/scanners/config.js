import path from "node:path";
import { readFile } from "node:fs/promises";

export async function loadRepoConfig(repoPath) {
  try {
    const raw = await readFile(path.join(repoPath, "varai.config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
