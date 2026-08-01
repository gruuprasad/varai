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
