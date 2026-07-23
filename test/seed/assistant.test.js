import assert from "node:assert/strict";
import test from "node:test";
import { createFakeAssistant, normalizeProposal } from "../../src/seed/assistant.js";
import { createOpenAICompatibleAssistant } from "../../src/seed/assistants/openai-compatible.js";
import { slotkeeperDraft } from "./fixtures.js";

function stubFetch(payload, { status = 200 } = {}) {
  const captured = [];
  const fetchImpl = async (url, init) => {
    captured.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    };
  };
  fetchImpl.captured = captured;
  return fetchImpl;
}

test("the adapter sends only conversation and current seed, with credentials in headers only", async () => {
  const captured = [];
  const fetchImpl = stubFetch({ choices: [{ message: { content: JSON.stringify({ draft: null, questions: ["q"], unsupported: [] }) } }] });
  const assistant = createOpenAICompatibleAssistant({ endpoint: "http://assistant.local/v1/chat/completions", model: "draft-1", apiKey: "sekrit", fetchImpl });
  const seed = slotkeeperDraft();

  const proposal = await assistant.propose({ conversation: [{ role: "user", content: "members book slots" }], seed });
  assert.deepEqual(proposal.questions, ["q"]);

  assert.equal(fetchImpl.captured.length, 1);
  const { init } = fetchImpl.captured[0];
  assert.equal(init.headers.Authorization, "Bearer sekrit");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "draft-1");
  const sent = JSON.stringify(body.messages);
  assert.ok(sent.includes("members book slots"));
  assert.ok(sent.includes("behavior.book-slot"), "current seed content is included");
  assert.ok(!sent.includes("sekrit"), "the credential never enters the payload");
  assert.ok(!sent.includes("routes.py"), "no repository code is sent");
});

test("code fences are stripped and proposals are normalized", async () => {
  const fetchImpl = stubFetch({ choices: [{ message: { content: "```json\n{\"draft\": null, \"questions\": [], \"unsupported\": [\"atomicity\"]}\n```" } }] });
  const assistant = createOpenAICompatibleAssistant({ endpoint: "http://x", model: "m", fetchImpl });
  const proposal = await assistant.propose({ conversation: [], seed: null });
  assert.deepEqual(proposal.unsupported, ["atomicity"]);
});

test("provider failures are loud, never silent", async () => {
  const fetchImpl = stubFetch({}, { status: 503 });
  const assistant = createOpenAICompatibleAssistant({ endpoint: "http://x", model: "m", fetchImpl });
  await assert.rejects(() => assistant.propose({ conversation: [], seed: null }), /HTTP 503/);
});

test("normalizeProposal rejects malformed assistant output", () => {
  assert.throws(() => normalizeProposal("not an object"));
  assert.throws(() => normalizeProposal({ draft: 42 }));
  assert.deepEqual(normalizeProposal({}), { draft: null, questions: [], unsupported: [] });
});

test("the fake assistant records calls and normalizes proposals", async () => {
  const fake = createFakeAssistant(() => ({ draft: null, questions: ["one"], unsupported: null }));
  const proposal = await fake.propose({ conversation: [], seed: null });
  assert.deepEqual(proposal.unsupported, []);
  assert.equal(fake.calls.length, 1);
});
