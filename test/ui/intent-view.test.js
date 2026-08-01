import assert from "node:assert/strict";
import test from "node:test";
import {
  renderDraftStructure,
  renderQuestions,
  renderReviewActions,
  renderSeedDiff,
  renderSeedStatus,
  renderUnsupported,
  renderUnresolvedQueue,
  shortHash,
} from "../../src/ui/intent-view.js";
import { diffSeeds } from "../../src/seed/diff.js";
import { seedContentHash } from "../../src/seed/identity.js";
import { slotkeeperDraft } from "../seed/fixtures.js";

function draftState() {
  const before = { ...slotkeeperDraft(), ratification: { status: "ratified", contentHash: "sha256:abc" } };
  const after = slotkeeperDraft();
  after.concepts.push({ id: "resource.waitlist", role: "resource", name: "Waitlist" });
  return {
    draft: after,
    source: "assistant",
    problems: [],
    diff: diffSeeds(before, after),
    contentHash: seedContentHash(after),
    questions: ["Should cancellations notify an admin?"],
    unsupported: ["Booking must be atomic"],
  };
}

test("the review view renders the proposal diff and an explicit ratify action", () => {
  const state = draftState();
  const diffHtml = renderSeedDiff(state.diff);
  assert.ok(diffHtml.includes("Draft vs approved spec"));
  assert.ok(diffHtml.includes("resource.waitlist"));
  assert.ok(diffHtml.includes("diff-added"));

  const actions = renderReviewActions({ ...state, questions: [], unsupported: [] });
  assert.ok(actions.includes("intent-ratify"), "ratification is an explicit button");
  assert.ok(actions.includes(shortHash(state.contentHash)), "the hash under review is visible");
  assert.ok(!actions.includes("disabled"), "a clean draft can be ratified");
});

test("validation problems block the ratify action", () => {
  const state = { ...draftState(), problems: [{ code: "unknown-relation", message: "forbids is not checkable" }], questions: [], unsupported: [] };
  const actions = renderReviewActions(state);
  assert.ok(actions.includes("disabled"));
});

test("unresolved questions block approval with an accessible reason and queue actions", () => {
  const state = draftState();
  const actions = renderReviewActions(state);
  assert.ok(actions.includes("disabled"));
  assert.ok(actions.includes("aria-describedby=\"intent-approve-blocked\""));
  assert.match(actions, /Resolve unresolved/i);

  const queue = renderUnresolvedQueue(state);
  assert.match(queue, /Unresolved \(2\)/);
  assert.match(queue, /unresolved-answer-input|unresolved-answer-submit/);
  assert.match(queue, /unresolved-to-context/);
  assert.match(queue, /unresolved-remove/);
  assert.match(queue, /for="unresolved-answer-/);
  assert.match(queue, /aria-label="Submit answer:/);
});

test("unresolved queue is the sole surface for questions and unsupported items", () => {
  const state = draftState();
  const queue = renderUnresolvedQueue(state);
  assert.match(queue, /Should cancellations notify an admin\?/);
  assert.match(queue, /Booking must be atomic/);
  // Standalone sections remain available for other callers, but the queue
  // already contains the text — Change view must not stack both.
  assert.ok(renderQuestions(state.questions).includes("Should cancellations"));
  assert.ok(renderUnsupported(state.unsupported).includes("Booking must be atomic"));
});

test("unsupported prose stays visible instead of disappearing", () => {
  const html = renderUnsupported(draftState().unsupported) + renderQuestions(draftState().questions);
  assert.ok(html.includes("Booking must be atomic"));
  assert.ok(html.includes("Should cancellations notify an admin?"));
});

test("seed status shows ratification state, hash, and git-dirty indication", () => {
  const seed = slotkeeperDraft();
  const ratified = renderSeedStatus({
    file: "varai.seed.json", seed, ratified: true, gitDirty: true,
    contentHash: seedContentHash(seed), problems: [],
  });
  assert.ok(ratified.includes("ratified"));
  assert.ok(ratified.includes("git dirty"));
  assert.ok(ratified.includes(shortHash(seedContentHash(seed))));

  const empty = renderSeedStatus({ file: "varai.seed.json", seed: null, ratified: false });
  assert.ok(empty.includes("draft one below"));
});

test("draft structure renders v4 state models, field contracts, and flows", () => {
  const draft = {
    system: { id: "demo", name: "Demo" },
    concepts: [
      { id: "resource.request", role: "resource", name: "Request", stateModel: { initial: "pending", states: ["pending", "approved"], transitions: [{ from: "pending", to: "approved", via: ["behavior.approve"] }] }, fields: [{ name: "amount", type: "number", required: true }] },
      { id: "behavior.approve", role: "behavior", name: "Approve" },
    ],
    commitments: [{ id: "commitment.approve-changes", source: "behavior.approve", relation: "changes", target: { literal: "approved" } }],
    flows: [{ id: "flow.cycle", name: "Cycle", entry: "surface.approve-api", members: ["behavior.approve"] }],
  };
  const html = renderDraftStructure(draft);
  assert.match(html, /state model: starts pending/);
  assert.match(html, /pending → approved via behavior\.approve/);
  assert.match(html, /fields: amount: number/);
  assert.match(html, /flow\.cycle/);
});
