import path from "node:path";
import { createBuildSessionStore } from "../build-session/store.js";
import { projectProgression } from "./project.js";

export async function runProgression(options = {}) {
  const repoPath = path.resolve(options.repo ?? ".");
  const sessions = (await createBuildSessionStore(repoPath).listSessions()).filter((session) => session.completion);
  const from = options.from;
  const to = options.to ?? sessions[0]?.id;
  if (!from || !to) throw new Error("Progression requires --from <completed build session> and --to <session> (or at least two completed sessions)");
  const result = await projectProgression(repoPath, { from, to });
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`Progression ${result.from.id} → ${result.to.id}\n`);
    for (const item of result.requirements) {
      process.stdout.write(`${item.id}: seed ${item.seed}; implementation ${item.implementation}; binding ${item.binding}; verdict ${item.verdict.from ?? "—"} → ${item.verdict.to ?? "—"}\n`);
    }
  }
  return result;
}
