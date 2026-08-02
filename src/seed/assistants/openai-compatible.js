import { normalizeProposal } from "../assistant.js";
import { CONCEPT_ROLES, RECORDED_ONLY_RELATIONS, SEED_RELATIONS, SURFACE_ACCESS, SURFACE_CHANNELS } from "../schema.js";
import { getDevelopmentRole } from "../../development-roles/definitions.js";

// One real SeedAssistant adapter: any OpenAI-compatible chat-completions
// endpoint. Configured through explicit endpoint/model and an environment-
// based credential. It sends only the conversation and the current seed —
// never repository code — and never writes or ratifies anything.

export const SYSTEM_PROMPT = `You draft Varai seed proposals. A seed is human-ratified source intent for a software system.
Reply with ONLY a JSON object of the form:
{
  "draft": { "formatVersion": 4, "system": {"id": ..., "name": ...}, "concepts": [...], "commitments": [...], "surfaces": [...], "scenarios": [...], "flows": [...], "context": [...] } | null,
  "questions": ["clarifying question for the human", ...],
  "unsupported": ["human statements you could not express in the vocabulary", ...]
}
Rules:
- Concept roles: ${CONCEPT_ROLES.join(", ")}. Concept ids look like "behavior.book-slot".
- Checkable relations: ${SEED_RELATIONS.filter((relation) => !RECORDED_ONLY_RELATIONS.includes(relation)).join(", ")}. Commitment targets are {"concept": "<id>"} or {"literal": "<scalar>"}.
- Commitments have exactly { "id": "commitment.booking-creates-booking", "source": "behavior.book-slot", "relation": "creates", "target": { "concept": "resource.booking" }, "expectation": "present" }. Use source, never subject.
- Surfaces (ids like "surface.withdraw-request-api") name one externally reachable way into the system: behavior concept, channel (${SURFACE_CHANNELS.join("|")}), access (${SURFACE_ACCESS.join("|")}). No HTTP paths, files, symbols, or framework names in surfaces.
- Scenarios (ids like "scenario.owner-can-withdraw") are bounded ordered examples only. Principals have exactly { "as": "owner", "actor": "actor.owner" }. Every step has a lower-kebab "id", "as" bound to a principal, "invoke" bound to a behavior, optional scalar/JSON "input", optional lower-kebab string "capture" naming the whole response, and required { "expect": { "status": 200, "body": { ...optional partial body... } } }. Later inputs may use refs like "$digest.body.briefs" where digest is a prior capture. No concurrency, windows, performance, expressions, DB inspection, or test code.
- Keep stable ids when renaming; never invent a relation outside the list.
- Seed format 4: a resource concept may declare a \`stateModel\` ({ "initial": "<state>", "states": ["<state>", ...], "transitions": [{ "from": "<state>", "to": "<state>", "via": ["behavior.<id>", ...] }] }) — every transition names declared from/to states and one or more behavior concepts that realize it. Declared transitions are checked for literal target-state assignments with from-state/path evidence; a bare assignment never proves a transition, so only declare transitions the product actually restricts.
- Seed format 4: a resource concept may declare \`fields\` ([{ "name": "<field_name>", "type": "string|integer|number|boolean|datetime|date|time|uuid|object|array", "required": true|false }]) — the data shape the product needs. Declare only fields that must exist; optional fields may be omitted.
- Seed format 4: \`flows\` (ids like "flow.request-lifecycle") group behavior members behind one surface entry: { "id": ..., "name": ..., "entry": "surface.<id>", "members": ["behavior.<id>", ...] }.
- Field names are lower snake_case. Context is an array of objects shaped exactly { "id": "context.some-limit", "text": "..." }, never strings.
- Prefer a small set of meaningful commitments. Put anything uncheckable in "unsupported", never in commitments.`;

export function roleSystemPrompt(developmentRole = null, roleContext = null) {
  const role = developmentRole ? getDevelopmentRole(developmentRole) : null;
  if (!role) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}

Active development role: ${role.label} (${role.id})
Responsibility: ${role.responsibility}
Role guidance: ${role.instruction}
The role is advisory. Preserve the full current draft, ask focused questions, and never silently ratify a decision.
The role context below is an evidence-backed projection, not raw source code:
${JSON.stringify(roleContext ?? null)}`;
}

export function stripCodeFences(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1] : trimmed;
}

export function parseJsonTranscript(text, matches = () => true) {
  const stripped = stripCodeFences(text);
  try {
    const value = JSON.parse(stripped);
    if (matches(value)) return value;
  }
  catch {
  }
  // Codex command output includes a transcript of the prompt before its
  // final JSON. Prefer the last complete JSON value instead of accidentally
  // parsing a schema example from that prompt.
  const lines = stripped.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const value = JSON.parse(line);
      if (matches(value)) return value;
    } catch { /* keep looking */ }
  }
  // Also accept pretty-printed final JSON embedded in a CLI transcript.
  // ponytail: bounded CLI output is small; a linear scanner can replace this
  // simple O(n²) fallback if transcript size ever becomes a concern.
  const candidates = [];
  for (let start = 0; start < stripped.length; start++) {
    if (stripped[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < stripped.length; index++) {
      const char = stripped[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth !== 0) continue;
        try {
          const value = JSON.parse(stripped.slice(start, index + 1));
          if (matches(value)) candidates.push(value);
        } catch { /* this object belonged to the transcript */ }
        break;
      }
    }
  }
  if (candidates.length) return candidates[candidates.length - 1];
  throw new Error("Assistant output was not valid JSON");
}

export function parseProposalJson(text) {
  return parseJsonTranscript(text, (value) => value && typeof value === "object" &&
    ("draft" in value || "questions" in value || "unsupported" in value));
}

export function createOpenAICompatibleAssistant({ endpoint, model, apiKey, fetchImpl } = {}) {
  if (!endpoint || !model) throw new Error("OpenAI-compatible assistant requires endpoint and model");
  const fetcher = fetchImpl ?? globalThis.fetch;
  if (!fetcher) throw new Error("No fetch implementation available");

  return {
    provider: "openai-compatible",
    model,
    endpoint,
    async propose({ conversation, seed, draft = null, developmentRole = null, roleContext = null }) {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: roleSystemPrompt(developmentRole, roleContext) },
            { role: "user", content: JSON.stringify({ conversation, currentSeed: seed ?? null, currentDraft: draft, developmentRole, roleContext }) },
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
        parsed = parseProposalJson(content);
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
