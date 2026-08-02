import assert from "node:assert/strict";
import test from "node:test";
import { createCommandSeedAssistant } from "../../src/seed/assistants/command.js";

test("command Seed assistant returns a normalized proposal without a shell", async () => {
  const proposal = `Proposal ready:\n${JSON.stringify({ draft: null, questions: ["Who uses it?"], unsupported: [] })}\nReview it.`;
  const assistant = createCommandSeedAssistant({
    executable: process.execPath,
    args: ["-e", `process.stdout.write(${JSON.stringify(proposal)})`],
  });
  const result = await assistant.propose({ conversation: [{ role: "user", content: "Build it" }], seed: null });
  assert.deepEqual(result, { draft: null, questions: ["Who uses it?"], unsupported: [] });
});

test("command Seed assistant exposes its configured model", () => {
  const assistant = createCommandSeedAssistant({ executable: "codex", args: ["--model", "gpt-5.6-luna", "exec"] });
  assert.equal(assistant.model, "gpt-5.6-luna");
});

test("command Seed assistant sends oversized prompts through stdin", async () => {
  const script = `const fs = require("node:fs"); if (process.argv.at(-1) !== "-") process.exit(2); process.stdin.resume(); process.stdin.on("end", () => process.stdout.write(JSON.stringify({ draft: null, questions: [], unsupported: [] })));`;
  const assistant = createCommandSeedAssistant({ executable: process.execPath, args: ["-e", script] });
  const result = await assistant.propose({ conversation: [{ role: "user", content: "x".repeat(70_000) }], seed: null });
  assert.deepEqual(result, { draft: null, questions: [], unsupported: [] });
});
