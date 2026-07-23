# varai UI Shell Revamp — Implementation Spec

**Goal:** Turn the dashboard from a menu of varai's internal projections into a verdict-first tool that answers one question — *did the build match what I asked?* — and fix the visual defects that make it look broken.

**Architecture:** Keep the proven mechanism and internal enums untouched. All changes live at the presentation seam: the server's `buildReviewProjection` (naming + counting), the browser render modules (`src/ui/*.js`), and the token layer in `styles.css`. No verdict is ever re-decided in the UI.

**Tech stack:** Vanilla ES modules served from `src/ui`, `node --test` for the two tests that matter, no build step.

**Testing posture:** Deliberately light. Tests only where logic can silently go wrong (counting, ordering). CSS and copy changes are verified by eye against the running pilot — not by assertions.

**Verify visually with:**
```bash
varai start ../varai-slotkeeper-pilot
# open http://localhost:3847, hard-refresh (Ctrl+Shift+R)
```

---

## Phase 1 — Stop looking broken (surgical, no logic)

Pure CSS/copy. Ship in one pass.

### Task 1.1: Card text no longer clips mid-sentence

**Cause:** `.card` (styles.css:742) is `overflow: hidden` and is a stretched grid item in `.bento-grid` (styles.css:495). When a card's content exceeds the resolved row height it gets clipped instead of growing — this is the "The current analyzer does not cover every behavior shape" cut-off in the *Couldn't determine* view.

**Fix:** make cards size to their own content instead of stretching to the row.

**Files:** Modify `src/ui/styles.css:495`

- [ ] Add `align-items: start;` to `.bento-grid`:

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  align-items: start;   /* content-sized cards; stretched rows clipped long text */
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: 8px 24px 32px;
}
```

- [ ] **Verify:** open *Couldn't determine*. Every card must show its full sentence with no text crossing or stopping at the border. If any card still clips, the secondary cause is the flex column min-size — then also add `.card-detail { min-height: 0; }`.

### Task 1.2: Badges and counts stop wrapping mid-word

`BUILDER'S MAP CURRENT` breaks over three lines inside its pill; `couldn't tell` splits across two lines in the counts row.

**Files:** Modify `src/ui/styles.css`

- [ ] Append near the badge rules:

```css
.seed-badge { white-space: nowrap; }
.review-count { white-space: nowrap; }
```

### Task 1.3: Fix the `1 observed areas` plural

**Files:** Modify `src/ui/app.js:190-193` (`renderTopbar`)

- [ ] Add a helper above `renderTopbar`:

```js
const plural = (count, singular, plural_ = `${singular}s`) => `${count} ${count === 1 ? singular : plural_}`;
```

- [ ] Replace the stats line:

```js
  el.topbarStats.innerHTML =
    `<span class="stat-pill"><strong>${areas.length}</strong> ${areas.length === 1 ? "observed area" : "observed areas"}</span>` +
    `<span class="stat-pill"><strong>${primaryOperations}</strong> primary · ${operations} ${operations === 1 ? "operation" : "operations"}</span>` +
    `<span class="stat-pill"><strong>${cores.length}</strong> ${cores.length === 1 ? "shared part" : "shared parts"}</span>`;
```

### Task 1.4: Remove the duplicated title on Capabilities detail

The behavior detail prints its name as the page title and again as the first section heading ("Book slot" twice).

**Files:** Modify `src/ui/app.js:527-548` (`behaviorList`)

- [ ] Give `behaviorList` an option to suppress its per-behavior heading, and pass it from the single-behavior detail:

```js
function behaviorList(behaviorIds, interfaceIds, byId, claimsBySource, changed, { showHeading = true } = {}) {
```

- [ ] Inside the `.map`, make the heading conditional:

```js
    return `<section class="behavior${changed.has(behaviorId) ? " behavior-changed" : ""}">` +
      (showHeading ? `<h3>${esc(frame?.name ?? behavior.name)}${changed.has(behaviorId) ? changeBadge() : ""}</h3>` : "") +
```

- [ ] At the `selectedCap?.type === "behavior"` branch (app.js:674), pass `{ showHeading: false }`:

```js
      behaviorList([selectedCap.item.behaviorId], selectedCap.item.interfaceIds, byId, claimsBySource, changed, { showHeading: false }) +
```

### Task 1.5: Never land mid-scroll in a detail pane

Opening a drill-down keeps the previous scroll position, so you arrive with the title already scrolled away (the "Back to List" screenshot).

**Files:** Modify `src/ui/app.js:138-152` (`renderPanes`), `src/ui/styles.css`

- [ ] In `renderPanes`, reset scroll whenever the focused item changes:

```js
let lastExpandedId = null;
function renderPanes(masterHtml, detailHtml) {
  if (el.bentoGrid) el.bentoGrid.innerHTML = masterHtml;
  if (el.focusContent) el.focusContent.innerHTML = detailHtml || emptyDetailPlaceholder();

  if (expandedId) {
    el.gridLayer?.classList.remove("active");
    el.focusLayer?.classList.add("active");
    if (expandedId !== lastExpandedId && el.focusContent) el.focusContent.scrollTop = 0;
  } else {
    el.focusLayer?.classList.remove("active");
    el.gridLayer?.classList.add("active");
  }
  lastExpandedId = expandedId;

  bindExpanders();
  bindSnippets();
}
```

- [ ] Make the back bar stick so context is never lost:

```css
.focus-topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg);
}
```

---

## Phase 2 — Say it in English, and stop miscounting

This is a correctness-of-meaning fix. Today a group reads `ACTOR.ADMINISTRATOR — 0/1 CONFIRMED` while the headline says **0 missing**. The denominator silently includes `performs` commitments, which are `not_checkable` and can *never* be confirmed. It reads as failure when nothing failed.

Enrich the projection once, server-side, so every surface gets plain names for free.

### Task 2.1: Add seed relation wording to the glossary

**Files:** Modify `src/reporters/display-language.js`

- [ ] Append (keeping the existing one-glossary rule from the vocabulary work):

```js
// Seed relations phrased as verbs, for composing requirement sentences.
export const SEED_RELATION_TEXT = Object.freeze({
  performs: "can",
  creates: "creates",
  changes: "changes",
  removes: "removes",
  reads: "reads",
  accepts: "accepts",
  produces: "returns",
  invokes: "calls",
  requires: "requires",
  fails_with: "fails with",
});

export function seedRelationText(relation) {
  return SEED_RELATION_TEXT[relation] ?? relation;
}
```

### Task 2.2: Project names and honest counts

**Files:** Modify `src/server/reconciliation.js`

- [ ] Change the export signature to accept the seed (line 51):

```js
export function buildReviewProjection({ report, model, seed }) {
```

- [ ] Build a concept-name lookup right after `envelopes` (line 55):

```js
  const conceptName = new Map((seed?.concepts ?? []).map((concept) => [concept.id, concept.name]));
  const nameOf = (id) => conceptName.get(id) ?? id;
  const targetLabel = (target) => target?.concept !== undefined ? nameOf(target.concept) : String(target?.literal);
```

- [ ] Add the two display fields to each card's returned object (alongside `source`/`relation`/`target`, line 74):

```js
      sourceName: nameOf(item.source),
      targetName: targetLabel(item.target),
```

- [ ] Replace the group mapping (lines 103-110) so `not_checkable` leaves the denominator:

```js
  const groups = [...groupsByConcept.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([concept, items]) => {
      const checkableCards = items.filter((card) => card.verdict !== "not_checkable");
      return {
        concept,
        conceptName: nameOf(concept),
        cards: items.sort((a, b) => a.id.localeCompare(b.id)),
        holds: items.filter((card) => card.verdict === "holds").length,
        checkable: checkableCards.length,
        notCheckable: items.length - checkableCards.length,
        total: items.length,
      };
    });
```

- [ ] Pass the seed at the call site (line 149):

```js
      const review = report && model ? buildReviewProjection({ report, model, seed: input.seed }) : null;
```

### Task 2.3: One test — counts and names

This is the one place a silent regression would mislead the user, so it earns a test.

**Files:** Create `test/server/review-projection.test.js`

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewProjection } from "../../src/server/reconciliation.js";

const seed = {
  concepts: [
    { id: "actor.administrator", name: "Administrator" },
    { id: "behavior.cancel-booking", name: "Cancel booking" },
  ],
};
const model = { elements: [], claims: [] };
const report = {
  system: { name: "Slotkeeper" },
  summary: { holds: 0, violated: 0, cannotVerify: 0, notCheckable: 1 },
  commitments: [{
    id: "commitment.admin-performs-cancel",
    source: "actor.administrator",
    relation: "performs",
    target: { concept: "behavior.cancel-booking" },
    verdict: "not_checkable",
    reasons: [],
    bindings: [],
    claimIds: [],
    coverage: [],
  }],
};

test("not_checkable commitments leave the confirmed denominator and concepts get plain names", () => {
  const review = buildReviewProjection({ report, model, seed });
  const [group] = review.groups;

  assert.equal(group.conceptName, "Administrator");
  assert.equal(group.holds, 0);
  assert.equal(group.checkable, 0, "a performs commitment is not checkable, so nothing is pending");
  assert.equal(group.notCheckable, 1);
  assert.equal(group.total, 1);

  assert.equal(review.groups[0].cards[0].sourceName, "Administrator");
  assert.equal(review.groups[0].cards[0].targetName, "Cancel booking");
});
```

- [ ] Run: `node --test test/server/review-projection.test.js` — expect pass.

### Task 2.4: Group headings read as English

**Files:** Modify `src/ui/review-view.js:49-52`

- [ ] Replace `renderGroupHeading` so it names the concept and never shows a misleading ratio:

```js
export function renderGroupHeading(group) {
  const score = group.checkable > 0
    ? `${group.holds} of ${group.checkable} confirmed`
    : "nothing to check";
  const noted = group.notCheckable ? ` · ${group.notCheckable} noted` : "";
  return `<h3 class="group-heading">${esc(group.conceptName ?? group.concept)} ` +
    `<span class="group-score">${esc(score)}${esc(noted)}</span></h3>`;
}
```

- [ ] **Verify:** the Review tab shows `Administrator — nothing to check · 1 noted`, not `ACTOR.ADMINISTRATOR 0/1 CONFIRMED`.

---

## Phase 3 — Collapse the nav from 8 to 4

*Observed areas, Subjects, Capabilities, Everything* are four slices of one graph. Keep every render function; re-parent them under one **Code map** destination with a segmented filter. *Couldn't determine* stops being a destination — coverage is a caveat, not a place.

**Files:** Modify `src/ui/app.js`

- [ ] Replace `renderNav` (app.js:205-226):

```js
const MAP_MODES = [
  ["system", "Areas"],
  ["subjects", "Subjects"],
  ["capabilities", "Capabilities"],
  ["everything", "Everything"],
];

function renderNav() {
  const changes = diffData?.diff?.summary?.semanticChanges ?? 0;
  el.sidebarNav.innerHTML =
    navItem("review", "✓", "Report", null) +
    navItem("intent", "✦", "Spec", null) +
    navItem("system", "◎", "Code map", null) +
    navItem("changes", "∆", "Changes", changes || null);
  el.sidebarNav.querySelectorAll("[data-view]").forEach((item) => item.addEventListener("click", () => {
    activeView = item.dataset.view;
    expandedId = null;
    changesOnly = false;
    el.search.value = "";
    if (el.searchClear) el.searchClear.hidden = true;
    render();
  }));
}
```

- [ ] Mark the Code map nav item active for any of its modes — change `navItem` (app.js:228):

```js
function navItem(view, fallbackIcon, name, count) {
  const iconSvg = NAV_ICONS[view] || esc(fallbackIcon);
  const active = activeView === view ||
    (view === "system" && MAP_MODES.some(([mode]) => mode === activeView));
  return `<button class="nav-item${active ? " active" : ""}" data-view="${view}">` +
    `<span class="nav-icon">${iconSvg}</span><span class="nav-name">${esc(name)}</span>` +
    `${count == null ? "" : `<span class="nav-count">${count}</span>`}</button>`;
}
```

- [ ] Add the mode switcher, rendered at the top of any Code map view:

```js
function renderMapModes() {
  return `<div class="map-modes">` + MAP_MODES.map(([mode, label]) =>
    `<button class="map-mode${activeView === mode ? " active" : ""}" data-mode="${mode}">${esc(label)}</button>`
  ).join("") + `</div>`;
}

function bindMapModes() {
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    activeView = button.dataset.mode;
    expandedId = null;
    render();
  }));
}
```

- [ ] Prepend it in the four map views. In `renderObservedAreas` (app.js:302) change the `renderPanes` call to:

```js
  renderPanes(renderMapModes() + strip + (rendered.masterHtml || rendered.html), rendered.detailHtml);
  bindMapModes();
```

Apply the same two lines to `renderSubjects` (app.js:463), `renderCapabilities` (app.js:680) and `renderEverything` (app.js:760) — prepend `renderMapModes()` to their master HTML and call `bindMapModes()` after `renderPanes`.

- [ ] Delete the `unknowns` route from `render()` (app.js:181) and delete `renderUnknowns` (app.js:763-778). Coverage now surfaces in Phase 4.

- [ ] Style the switcher:

```css
.map-modes { display: flex; gap: 4px; margin: 0 0 14px; flex-wrap: wrap; }
.map-mode {
  padding: 5px 12px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-mid); font: inherit; font-size: 12.5px;
}
.map-mode.active { background: var(--bg-active); border-color: var(--accent-border); color: var(--text-bright); }
```

---

## Phase 4 — The Report page

The home screen becomes the answer, ordered by what needs attention, with varai's thesis made literal: **what you asked · what the builder says · what varai found.**

### Task 4.1: New report module

**Files:** Create `src/ui/report-view.js`

```js
// Verdict-first presentation of the reconciliation review. Ordering is by what
// needs attention — never by concept id. Builder testimony stays visually
// separate from independently observed evidence; nothing here re-decides a verdict.

import { verdictLabel, reasonLabel, bindingStateLabel, seedRelationText } from "../reporters/display-language.js";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Attention order: what is wrong, then what is uncertain, then what is merely
// recorded, then what is fine.
export const BUCKETS = Object.freeze([
  ["violated", "Missing", "varai could not find these in the code."],
  ["cannot_verify", "Couldn't tell", "varai found something but could not confirm it."],
  ["not_checkable", "Noted", "Recorded in your spec, but not the kind of rule varai can check."],
  ["holds", "Confirmed", "Found in the code."],
]);

export function allCards(review) {
  return (review?.groups ?? []).flatMap((group) => group.cards);
}

export function bucketCards(review) {
  const cards = allCards(review);
  return BUCKETS
    .map(([verdict, title, blurb]) => ({
      verdict, title, blurb,
      cards: cards.filter((card) => card.verdict === verdict),
    }))
    .filter((bucket) => bucket.cards.length > 0);
}

export function requirementSentence(card) {
  const source = card.sourceName ?? card.source;
  const target = card.targetName ?? (card.target?.concept ?? card.target?.literal ?? "");
  return `${source} ${seedRelationText(card.relation)} ${target}`.trim();
}

export function headlineSentence(review) {
  const { holds, violated, cannotVerify, notCheckable } = review.summary;
  const checkable = holds + violated + cannotVerify;
  const parts = [`<strong>${holds} of ${checkable} requirements are confirmed in the code.</strong>`];
  if (violated) parts.push(`${violated} ${violated === 1 ? "is" : "are"} missing.`);
  if (cannotVerify) parts.push(`${cannotVerify} couldn't be checked.`);
  if (notCheckable) parts.push(`${notCheckable} ${notCheckable === 1 ? "is" : "are"} noted but not the kind of rule varai can check.`);
  return parts.join(" ");
}

function evidenceByFile(steps) {
  const files = new Map();
  for (const step of steps ?? []) {
    const lines = files.get(step.file) ?? [];
    if (step.line != null) lines.push(step.line);
    files.set(step.file, lines);
  }
  return [...files].map(([file, lines]) => ({ file, lines: [...new Set(lines)].sort((a, b) => a - b) }));
}

// Chips and their snippet holders must be siblings: app.js's toggleSnippet()
// looks the holder up with button.parentElement.querySelector(...), so wrapping
// the chips in their own span would break source peeking.
function renderEvidence(steps) {
  const grouped = evidenceByFile(steps);
  if (!grouped.length) return `<p class="empty-copy">No location.</p>`;
  return `<ul class="evidence-list">` + grouped.map(({ file, lines }) =>
    `<li><code>${esc(file)}</code>` +
    lines.map((line) =>
      `<button class="line-chip trace-step" data-file="${esc(file)}" data-line="${line}">${line}</button>` +
      `<div class="snippet" data-snippet="${esc(`${file}:${line}`)}" hidden></div>`).join("") +
    `</li>`).join("") + `</ul>`;
}

function renderRow(card, expanded) {
  return `<article class="req-row${expanded ? " open" : ""}">` +
    `<button class="req-head" data-expand="${esc(card.id)}" aria-expanded="${expanded}">` +
    `<span class="req-verdict verdict-${esc(card.verdict)}">${esc(verdictLabel(card.verdict))}</span>` +
    `<span class="req-text">${esc(requirementSentence(card))}</span>` +
    `<span class="chevron">›</span></button>` +
    (expanded ? renderRowDetail(card) : "") +
    `</article>`;
}

function renderRowDetail(card) {
  const reasons = card.reasons?.length
    ? `<p class="reason-line">why: ${card.reasons.map((code) => reasonLabel(code)).join("; ")}</p>`
    : "";
  const builder = card.bindings?.length
    ? `<ul class="binding-list">` + card.bindings.map((binding) =>
        `<li>${esc(binding.elements.map((element) => element.name).join(", ") || binding.concept)} ` +
        `<span class="binding-state">${esc(bindingStateLabel(binding.state))}</span></li>`).join("") + `</ul>`
    : `<p class="empty-copy">No location given.</p>`;
  const found = card.claims?.length
    ? card.claims.map((claim) =>
        `<div class="claim"><p><strong>${esc(claim.targetName)}</strong> <span class="state-mark">${esc(claim.claimState)}</span></p>` +
        renderEvidence(claim.implementationPath?.length ? claim.implementationPath : claim.evidence) + `</div>`).join("")
    : `<p class="empty-copy">Nothing matching found in the code.</p>`;

  return `<div class="req-detail">${reasons}<div class="truth-columns">` +
    `<section><h4>You asked</h4><p class="asked">${esc(requirementSentence(card))}</p></section>` +
    `<section><h4>The builder says</h4>${builder}</section>` +
    `<section><h4>varai found</h4>${found}</section>` +
    `</div></div>`;
}

export function renderReport(review, { expandedId } = {}) {
  if (!review) return `<p class="empty-copy">No spec found. Write one in Spec first.</p>`;
  const badge = review.ratified ? "approved" : "draft";
  let html = `<section class="report-head">` +
    `<h2>${esc(review.system?.name ?? "System")} <span class="seed-badge ${badge}">${badge}</span></h2>` +
    `<p class="headline">${headlineSentence(review)}</p></section>`;

  for (const bucket of bucketCards(review)) {
    html += `<section class="req-bucket bucket-${esc(bucket.verdict)}">` +
      `<h3>${esc(bucket.title)} <span class="bucket-count">${bucket.cards.length}</span></h3>` +
      `<p class="bucket-blurb">${esc(bucket.blurb)}</p>` +
      bucket.cards.map((card) => renderRow(card, card.id === expandedId)).join("") +
      `</section>`;
  }

  if (review.context?.length) {
    html += `<details class="report-notes"><summary>Notes from your spec (${review.context.length})</summary>` +
      `<ul>${review.context.map((entry) => `<li>${esc(entry.text)}</li>`).join("")}</ul></details>`;
  }
  if (review.coverageLimitations?.length) {
    html += `<details class="report-limits"><summary>Limits of this check (${review.coverageLimitations.length})</summary>` +
      `<ul>${review.coverageLimitations.map((item) =>
        `<li>${esc(item.id.replace(/^commitment\./, ""))} — ${esc(item.reasons.map((code) => reasonLabel(code)).join("; "))}</li>`).join("")}</ul></details>`;
  }
  return html;
}
```

### Task 4.2: One test — attention ordering

Ordering is the whole point of the page and would regress silently.

**Files:** Create `test/ui/report-view.test.js`

```js
import assert from "node:assert/strict";
import test from "node:test";
import { bucketCards, headlineSentence, requirementSentence } from "../../src/ui/report-view.js";

const review = {
  summary: { holds: 1, violated: 1, cannotVerify: 1, notCheckable: 1 },
  groups: [{
    concept: "behavior.book-slot",
    cards: [
      { id: "c.holds", verdict: "holds", relation: "creates", sourceName: "Book slot", targetName: "Booking" },
      { id: "c.noted", verdict: "not_checkable", relation: "performs", sourceName: "Member", targetName: "Book slot" },
      { id: "c.missing", verdict: "violated", relation: "creates", sourceName: "Book slot", targetName: "Audit record" },
      { id: "c.unknown", verdict: "cannot_verify", relation: "requires", sourceName: "Book slot", targetName: "slot is available" },
    ],
  }],
};

test("requirements are bucketed by what needs attention, worst first", () => {
  const order = bucketCards(review).map((bucket) => bucket.verdict);
  assert.deepEqual(order, ["violated", "cannot_verify", "not_checkable", "holds"]);
});

test("a requirement reads as an English sentence and the headline excludes uncheckable rules", () => {
  assert.equal(requirementSentence(review.groups[0].cards[0]), "Book slot creates Booking");
  assert.equal(requirementSentence(review.groups[0].cards[1]), "Member can Book slot");
  assert.match(headlineSentence(review), /1 of 3 requirements are confirmed/);
});
```

- [ ] Run: `node --test test/ui/report-view.test.js` — expect pass.

### Task 4.3: Route Report as the home view

**Files:** Modify `src/ui/app.js`

- [ ] Import at the top:

```js
import { renderReport } from "./report-view.js";
```

- [ ] Replace the body of `renderReview` (app.js:379-414) with:

```js
function renderReview() {
  showSearch("Search your requirements...");
  el.searchCount.textContent = "";
  const review = reconciliationData?.review ?? null;

  if (!reconciliationData?.seed) {
    renderPanes(
      `<p class="empty-copy">No spec found. Write one in Spec first.</p>`,
      emptyDetailPlaceholder("Nothing to report", "varai needs an approved spec to check against."),
    );
    return;
  }
  const query = el.search.value.toLowerCase().trim();
  const filtered = query && review
    ? { ...review, groups: review.groups.map((group) => ({
        ...group,
        cards: group.cards.filter((card) =>
          `${card.sourceName ?? ""} ${card.targetName ?? ""} ${card.id}`.toLowerCase().includes(query)),
      })) }
    : review;

  const witnessWarnings = (reconciliationData.realizationProblems ?? [])
    .map((problem) => `<p class="witness-warning">builder's map: ${esc(problem.message)}</p>`).join("");

  // renderPanes already calls bindExpanders() and bindSnippets(); binding again
  // here would attach a second listener per chip and cancel every toggle out.
  renderPanes(witnessWarnings + renderReport(filtered, { expandedId }), "");
}
```

- [ ] Make `review` the landing view (app.js:48):

```js
let activeView = "review";
```

- [ ] **Verify:** on load you land on Report; the pilot shows *12 of 13 requirements are confirmed*, with **Couldn't tell (1)** listed above **Confirmed (12)**, and 4 under **Noted**.

### Task 4.4: Report styles

**Files:** Modify `src/ui/styles.css`

```css
.report-head { max-width: 72ch; margin: 0 0 24px; }
.report-head h2 { display: flex; align-items: center; gap: 10px; }
.headline { font-size: 16px; line-height: 1.6; color: var(--text); }

.req-bucket { max-width: 72ch; margin: 0 0 28px; }
.req-bucket h3 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 2px; }
.bucket-count { font-size: 12px; color: var(--text-dim); }
.bucket-blurb { font-size: 12.5px; color: var(--text-dim); margin: 0 0 10px; }

.req-row { border: 1px solid var(--border); border-radius: 10px; margin-bottom: 6px; background: var(--bg-card); }
.req-head {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 10px 12px; background: transparent; border: 0; cursor: pointer;
  color: inherit; font: inherit; text-align: left;
}
.req-text { flex: 1; min-width: 0; }
.req-verdict { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }

.truth-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 4px 12px 14px; }
.truth-columns h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-dim); margin: 0 0 6px; }

.evidence-list { list-style: none; padding: 0; margin: 4px 0 0; display: flex; flex-direction: column; gap: 6px; }
.evidence-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.evidence-list .snippet { flex-basis: 100%; }   /* snippets open on their own row */
.line-chip { border: 1px solid var(--border); border-radius: 5px; background: transparent; color: var(--text-mid); cursor: pointer; font: inherit; font-size: 11px; padding: 0 5px; }
.line-chip:hover { border-color: var(--accent-border); color: var(--text-bright); }

.report-notes, .report-limits { max-width: 72ch; margin-top: 18px; color: var(--text-mid); font-size: 13px; }
```

---

## Phase 5 — Visual system: stop the accent fighting the meaning

Emerald is currently the brand, the active-nav state **and** "confirmed" — so the most meaningful signal in the product reads as chrome.

**Files:** Modify `src/ui/styles.css`

- [ ] Add verdict tokens to both themes (after the existing accent block in each `:root` / dark block):

```css
  /* Verdict semantics. These are the only saturated colors in the product. */
  --verdict-confirmed: #059669;
  --verdict-missing:   #dc2626;
  --verdict-unknown:   #b45309;
  --verdict-noted:     #6b7c72;
```

Dark theme values:

```css
  --verdict-confirmed: #10b981;
  --verdict-missing:   #f87171;
  --verdict-unknown:   #fbbf24;
  --verdict-noted:     #8aa0b8;
```

- [ ] Bind them:

```css
.verdict-holds, .req-verdict.verdict-holds { color: var(--verdict-confirmed); }
.verdict-violated, .req-verdict.verdict-violated { color: var(--verdict-missing); }
.verdict-cannot_verify, .req-verdict.verdict-cannot_verify { color: var(--verdict-unknown); }
.verdict-not_checkable, .req-verdict.verdict-not_checkable { color: var(--verdict-noted); }

.bucket-violated h3 { color: var(--verdict-missing); }
.bucket-cannot_verify h3 { color: var(--verdict-unknown); }
```

- [ ] Desaturate chrome so verdicts win: relation chips lose their hue.

```css
.relation-chip { background: transparent; border: 1px solid var(--border); color: var(--text-mid); }
```

- [ ] Raise dark-mode secondary contrast — `--text-mid: #8aa0b8` on `#0c1118` is thin for the text most of the UI is made of:

```css
  --text-mid: #9db0c6;
```

- [ ] **Verify:** in both themes, the only strongly colored things on Report are verdict words. Toggle with the sun/moon button and confirm the dark theme is legible.

---

## Sequencing

Phases 1–3 are largely subtractive and land in one session. Phase 4 is the real build. Phase 5 is a polish pass that only makes sense after 4 exists.

Ship each phase as its own commit off `origin/main` in a worktree, per the repo's workflow:

```bash
git worktree add -b ui-shell-revamp .worktrees/ui-shell-revamp origin/main
ln -s /home/gp/dreamLand/jodulabs/varai/node_modules .worktrees/ui-shell-revamp/node_modules
```

Full suite must stay green (`node --test`, currently 331 tests) and the served module graph must keep resolving — `test/server/static-assets.test.js` guards that any new UI module is actually reachable in the browser.

## Out of scope

- No change to reconciliation logic, verdict derivation, seed schema, or the scanner. Verdicts are read, never recomputed.
- No framework, bundler, or dependency is introduced.
- Delete-only for `renderUnknowns`; the coverage data itself stays in the model and now surfaces under "Limits of this check".
