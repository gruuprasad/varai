import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CODEX = Object.freeze({
  assistant: {
    executable: "codex",
    args: ["--model", "gpt-5.6-luna", "--ask-for-approval", "never", "exec", "--sandbox", "read-only", "--ephemeral", "--skip-git-repo-check", "--color", "never"],
  },
  builders: {
    codex: {
      executable: "codex",
      args: ["--model", "gpt-5.6-luna", "--ask-for-approval", "never", "exec", "--sandbox", "workspace-write", "--color", "never"],
      packetMode: "argument",
    },
  },
});

export function runCreate({ repo, builder = "codex", quiet = false } = {}) {
  if (!repo) throw new Error("create requires a project path");
  if (builder !== "codex") throw new Error(`Unsupported builder "${builder}"; currently available: codex`);
  const target = path.resolve(repo);
  if (fs.existsSync(target) && fs.readdirSync(target).length) {
    throw new Error(`Refusing to create project in non-empty directory: ${target}`);
  }
  fs.mkdirSync(target, { recursive: true });
  const name = path.basename(target);
  fs.writeFileSync(path.join(target, "README.md"), `# ${name}

This project is developed through Varai.

## Start

From the Varai checkout:

\`\`\`bash
varai start . --no-open
\`\`\`

Use the Develop conversation to describe the product, review and approve its
Seed, run the local Codex builder, and inspect independent verification.

The generated configuration uses the local Codex CLI with model
\`gpt-5.6-luna\`. No API platform or API key is required.
`, "utf8");
  fs.writeFileSync(path.join(target, ".gitignore"), ".varai/\n.memsearch/\n", "utf8");
  fs.writeFileSync(path.join(target, "varai.config.json"), `${JSON.stringify(CODEX, null, 2)}\n`, "utf8");
  execFileSync("git", ["init", "-q", target]);
  execFileSync("git", ["-C", target, "add", "."]);
  execFileSync("git", ["-C", target, "-c", "user.name=Varai", "-c", "user.email=varai@localhost", "commit", "-qm", "Initialize Varai project"]);
  if (!quiet) process.stdout.write(`Created ${name} at ${target}\nNext: varai start ${target}\n`);
  return { path: target, builder };
}
