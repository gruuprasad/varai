import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildBuilderEnv } from "../../builder/process-adapter.js";
import { normalizeProposal } from "../assistant.js";
import { parseProposalJson, SYSTEM_PROMPT } from "./openai-compatible.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;

export function createCommandSeedAssistant({ executable, args = [], envAllowlist = [], sourceEnv = process.env } = {}) {
  if (!executable || typeof executable !== "string") throw new Error("Command Seed assistant requires executable");
  const modelIndex = args.indexOf("--model");
  return {
    provider: "local-command",
    model: modelIndex >= 0 ? args[modelIndex + 1] : executable,
    async propose({ conversation, seed, draft = null }) {
      const prompt = `${SYSTEM_PROMPT}\n\nInput:\n${JSON.stringify({ conversation, currentSeed: seed ?? null, currentDraft: draft })}`;
      const cwd = await mkdtemp(path.join(os.tmpdir(), "varai-seed-assistant-"));
      try {
        const output = await new Promise((resolve, reject) => {
          const child = spawn(executable, [...args, prompt], {
            cwd,
            env: buildBuilderEnv(sourceEnv, { envAllowlist }),
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
          });
          const stdout = [];
          const stderr = [];
          let size = 0;
          child.stdout.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_OUTPUT_BYTES) child.kill("SIGKILL");
            else stdout.push(chunk);
          });
          child.stderr.on("data", (chunk) => stderr.push(chunk));
          child.once("error", reject);
          child.once("exit", (code) => {
            if (size > MAX_OUTPUT_BYTES) reject(new Error("Seed assistant output exceeded 1 MiB"));
            else if (code !== 0) reject(new Error(`Seed assistant exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
            else resolve(Buffer.concat(stdout).toString("utf8"));
          });
        });
        try {
          return normalizeProposal(parseProposalJson(output));
        } catch {
          throw new Error("Seed assistant proposal was not valid JSON");
        }
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
