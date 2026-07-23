// The SeedAssistant boundary (ADR 0005). An assistant is an untrusted drafting
// surface: it receives only the human conversation and the current seed —
// never repository code — and returns a structured proposal. It cannot write
// or ratify the seed. Every outbound call is an explicit user action.

// A proposal is { draft?, questions?, unsupported? }:
// - draft: a complete seed document draft (without ratification), or null when
//   the assistant only has clarifying questions;
// - questions: clarifying questions for the human;
// - unsupported: human statements the assistant could not express in the
//   checkable vocabulary. They stay visible; they never vanish into the draft.
export function normalizeProposal(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Assistant proposal must be an object");
  }
  const proposal = {
    draft: raw.draft ?? null,
    questions: Array.isArray(raw.questions) ? raw.questions.map(String) : [],
    unsupported: Array.isArray(raw.unsupported) ? raw.unsupported.map(String) : [],
  };
  if (proposal.draft !== null && (typeof proposal.draft !== "object" || Array.isArray(proposal.draft))) {
    throw new Error("Assistant proposal draft must be an object or null");
  }
  return proposal;
}

// A deterministic fake for tests and offline development. The handler shapes
// the proposal; the default asks one clarifying question and drafts nothing.
export function createFakeAssistant(handler = null) {
  const calls = [];
  return {
    provider: "fake",
    model: "deterministic-fake",
    calls,
    async propose(input) {
      calls.push(input);
      const proposal = handler ? await handler(input) : { draft: null, questions: ["What should the system do?"], unsupported: [] };
      return normalizeProposal(proposal);
    },
  };
}
