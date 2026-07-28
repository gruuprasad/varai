import assert from "node:assert/strict";
import test from "node:test";
import {
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
  assert.match(queue, /unresolved-answer/);
  assert.match(queue, /unresolved-to-context/);
  assert.match(queue, /unresolved-remove/);
  assert.match(queue, /aria-label="Answer:/);
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
