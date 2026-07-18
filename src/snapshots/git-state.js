import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

async function git(repoPath, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], { encoding: "utf8" });
    return stdout.trim();
  } catch (err) {
    throw new Error(`Cannot read Git state: ${err.stderr?.trim() || err.message}`);
  }
}

export async function readGitState(repoPath) {
  const head = await git(repoPath, ["rev-parse", "HEAD"]);
  const root = await git(repoPath, ["rev-parse", "--show-toplevel"]);
  const gitCommonDir = await git(repoPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const status = await git(repoPath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  const semanticStoreRoot = path.basename(gitCommonDir) === ".git"
    ? path.dirname(gitCommonDir)
    : gitCommonDir;
  return { head, root, gitCommonDir, semanticStoreRoot, clean: status.length === 0,
    statusLines: status ? status.split("\n").sort() : [] };
}
