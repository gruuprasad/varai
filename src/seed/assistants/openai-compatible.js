import { normalizeProposal } from "../assistant.js";
import { CONCEPT_ROLES, RECORDED_ONLY_RELATIONS, SEED_RELATIONS, SURFACE_ACCESS, SURFACE_CHANNELS } from "../schema.js";

// One real SeedAssistant adapter: any OpenAI-compatible chat-completions
// endpoint. Configured through explicit endpoint/model and an environment-
// based credential. It sends only the conversation and the current seed —
// never repository code — and never writes or ratifies anything.

const SYSTEM_PROMPT = `You draft Varai seed proposals. A seed is human-ratified source intent for a software system.
Reply with ONLY a JSON object of the form:
{
  "draft": { "formatVersion": 3, "system": {"id": ..., "name": ...}, "concepts": [...], "commitments": [...], "surfaces": [...], "scenarios": [...], "context": [...] } | null,
  "questions": ["clarifying question for the human", ...],
  "unsupported": ["human statements you could not express in the vocabulary", ...]
}
Rules:
- Concept roles: ${CONCEPT_ROLES.join(", ")}. Concept ids look like "behavior.book-slot".
- Checkable relations: ${SEED_RELATIONS.filter((relation) => !RECORDED_ONLY_RELATIONS.includes(relation)).join(", ")}. Commitment targets are {"concept": "<id>"} or {"literal": "<scalar>"}.
- Commitment ids look like "commitment.booking-creates-booking". Every commitment has "expectation": "present" or "absent".
- Surfaces (ids like "surface.withdraw-request-api") name one externally reachable way into the system: behavior concept, channel (${SURFACE_CHANNELS.join("|")}), access (${SURFACE_ACCESS.join("|")}). No HTTP paths, files, symbols, or framework names in surfaces.
- Scenarios (ids like "scenario.owner-can-withdraw") are bounded ordered examples: principals bound to actor concepts, sequential steps that invoke behaviors, scalar/JSON input, capture, and expect.status / optional expect.body. Scenarios may be an empty array when the human has not authored examples yet.
- Keep stable ids when renaming; never invent a relation outside the list.
- Prefer a small set of meaningful commitments. Put anything uncheckable in "unsupported", never in commitments.`;

function stripCodeFences(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1] : trimmed;
}

export function createOpenAICompatibleAssistant({ endpoint, model, apiKey, fetchImpl } = {}) {
  if (!endpoint || !model) throw new Error("OpenAI-compatible assistant requires endpoint and model");
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (!fetcher) throw new Error("No fetch implementation available");

  return {
    provider: "openai-compatible",
    model,
    endpoint,
    async propose({ conversation, seed, draft = null }) {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify({ conversation, currentSeed: seed ?? null, currentDraft: draft }) },
          ],
          temperature: 0,
        }),
      });
      if (!response.ok) throw new Error(`Assistant request failed: HTTP ${response.status}`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) throw new Error("Assistant returned no proposal content");
      let parsed;
      try {
        parsed = JSON.parse(stripCodeFences(content));
      } catch {
        throw new Error("Assistant proposal was not valid JSON");
      }
      return normalizeProposal(parsed);
    },
  };
}

// Build the configured assistant from the environment, or null when the pilot
// has no provider configured (the UI then offers manual proposal import).
export function assistantFromEnvironment(env = process.env) {
  const endpoint = env.VARAI_SEED_ASSISTANT_ENDPOINT;
  const model = env.VARAI_SEED_ASSISTANT_MODEL;
  if (!endpoint || !model) return null;
  return createOpenAICompatibleAssistant({
    endpoint,
    model,
    apiKey: env.VARAI_SEED_ASSISTANT_API_KEY,
  });
}
