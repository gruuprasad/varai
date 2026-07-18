import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
  const status = await git(repoPath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return { head, root, clean: status.length === 0, statusLines: status ? status.split("\n").sort() : [] };
}
