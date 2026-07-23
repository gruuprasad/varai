# Spec Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Spec page show and edit the approved spec, instead of showing three cards that describe a spec you cannot see.

**Architecture:** The Spec page becomes a document with three states — *no spec*, *approved spec*, *draft under review* — all rendered into the grid layer. Presentation moves into a new `src/ui/spec-view.js`; `src/ui/intent-view.js` keeps only draft-review helpers. No server or reconciliation changes: verdicts are joined onto seed commitments by id, in the browser.

**Tech Stack:** Vanilla ES modules served from `src/ui` (no build step), `node --test`.

---

## Why this plan exists

The UI shell revamp (2026-07-23) renamed Intent → Spec and never touched it. Six defects, in the order they hurt:

1. **The page never shows your spec.** The only renderer of spec structure, `renderDraftStructure` (`src/ui/intent-view.js:57`), runs on the *draft*. An approved seed of 11 concepts and 17 commitments renders as the string "11 things · 17 requirements".
2. **The approve workflow is unreachable.** `renderIntent` (`src/ui/app.js:352`) puts the draft structure, diff, and Approve/Discard buttons into `detailHtml`. `renderPanes` (`src/ui/app.js:139`) only activates the focus layer when `expandedId` is set, and nothing on the Spec page sets it — nav clicks reset it to `null` and `intent-view.js` emits no `[data-expand]`. Importing a proposal today renders the whole review into a hidden layer.
3. **The search bar is a fake headline.** `showSearch("Your spec — write down what the system must do…")` puts instructional prose into an input that filters nothing on this page.
4. **Three unrelated things are peers in a bento row**, followed by an empty viewport: a status chip strip rendered as a card, a composer, and a "Latest check" card.
5. **"Latest check" duplicates Report** with no link to it.
6. **Context notes render nowhere.** `seed.context` entries are part of the spec and appear on no screen.

Also fixed along the way: `.diff-added/.diff-removed/.diff-changed` and `.intent-ratify` use hardcoded hex (`#166534`, `#991b1b`, `#854d0e`) that is illegible on the dark ground.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/ui/spec-view.js` | **new** — pure presentation of an approved spec: section ordering, verdict join, requirement sentences, header band, notes |
| `src/ui/intent-view.js` | keeps draft-review helpers (`renderSeedStatus` shrinks to a badge strip, `renderProblems`, `renderSeedDiff`, `renderDraftStructure`, `renderReviewActions`, `renderQuestions`, `renderUnsupported`) |
| `src/ui/app.js` | `renderIntent` rewritten as a three-state switch; adds `bindSpecLinks` |
| `src/ui/styles.css` | `.spec-*` block; `.intent-*` trimmed; diff colors moved onto verdict tokens |
| `test/ui/spec-view.test.js` | **new** — 3 tests: role-list drift guard, section ordering/coverage, verdict join |

Testing stays deliberately thin: the tests cover the three places a silent wrong answer is possible (a concept vanishing from the document, a verdict attaching to the wrong requirement, the browser-safe role list drifting from the seed vocabulary). CSS, copy, and DOM wiring are verified by looking at the page.

---

## Task 1: Draft review renders where you can see it

The smallest change that turns a dead end into a working page. Ships alone.

**Files:**
- Modify: `src/ui/app.js:325-359`

- [ ] **Step 1: Move the draft review out of `detailHtml`**

In `renderIntent`, replace the `const detailHtml = …` block and the `renderPanes` call (`src/ui/app.js:352-359`) with:

```js
  // The Spec page never uses the focus layer — nothing here sets expandedId, so
  // anything rendered into detailHtml is invisible. Draft review goes inline.
  if (draft?.draft) {
    masterHtml += `<section class="spec-review">` +
      `<h3 class="group-heading">Draft under review (${esc(draft.source)})</h3>` +
      renderProblems(draft.problems) +
      renderSeedDiff(draft.diff) +
      renderDraftStructure(draft.draft) +
      renderReviewActions(draft) +
      `</section>`;
  }
  renderPanes(masterHtml, "", { inlineExpand: true });
```

- [ ] **Step 2: Check the whole test suite still passes**

Run: `node --test`
Expected: `pass 334`, `fail 0`

- [ ] **Step 3: Verify by hand**

Run `node bin/varai.js start ../varai-slotkeeper-pilot`, open Spec, expand **Import a proposal JSON**, paste the current `varai.seed.json` wrapped as `{"draft": <contents>}`, click **Import proposal**.
Expected: the diff ("No semantic differences."), the concept/commitment tables, and **Approve this draft** / **Discard draft** all appear on the page. Before this task they appeared nowhere.

- [ ] **Step 4: Commit**

```bash
git add src/ui/app.js
git commit -m "fix(ui): show the draft review instead of rendering it into a hidden layer"
```

---

## Task 2: The approved spec as a document

**Files:**
- Create: `src/ui/spec-view.js`
- Test: `test/ui/spec-view.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/ui/spec-view.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { specSections, verdictById, ROLE_ORDER } from "../../src/ui/spec-view.js";
import { CONCEPT_ROLES } from "../../src/seed/schema.js";

const seed = {
  system: { id: "slotkeeper", name: "Slotkeeper" },
  concepts: [
    { id: "resource.booking", role: "resource", name: "Booking" },
    { id: "behavior.book-slot", role: "behavior", name: "Book Slot" },
    { id: "actor.member", role: "actor", name: "Member" },
  ],
  commitments: [
    { id: "commitment.member-performs-book", source: "actor.member", relation: "performs", target: { concept: "behavior.book-slot" } },
    { id: "commitment.book-slot-creates-booking", source: "behavior.book-slot", relation: "creates", target: { concept: "resource.booking" } },
    { id: "commitment.book-slot-fails-409", source: "behavior.book-slot", relation: "fails_with", target: { literal: "409" } },
  ],
  context: [],
};

const review = {
  groups: [
    { concept: "behavior.book-slot", cards: [
      { id: "commitment.book-slot-creates-booking", verdict: "holds" },
      { id: "commitment.book-slot-fails-409", verdict: "cannot_verify" },
    ] },
    { concept: "actor.member", cards: [
      { id: "commitment.member-performs-book", verdict: "not_checkable" },
    ] },
  ],
};

test("the browser-safe role list matches the seed vocabulary", () => {
  // spec-view.js cannot import ../seed/schema.js (the server serves only
  // /reporters/ to the browser), so this is the guard against the copy drifting.
  assert.deepEqual([...ROLE_ORDER], [...CONCEPT_ROLES]);
});

test("every concept appears, ordered by role, with its own requirements", () => {
  const sections = specSections(seed, review);
  assert.deepEqual(sections.map((section) => section.concept.id),
    ["actor.member", "behavior.book-slot", "resource.booking"]);

  const [member, bookSlot, booking] = sections;
  assert.deepEqual(member.requirements.map((req) => req.text), ["can Book Slot"]);
  assert.deepEqual(bookSlot.requirements.map((req) => req.text),
    ["creates Booking", "fails with 409"]);
  // A concept that is only ever a target still gets a row, so nothing is hidden.
  assert.equal(booking.requirements.length, 0);
  assert.equal(booking.referencedBy, 1);
});

test("verdicts join by commitment id; unchecked requirements stay null", () => {
  const verdicts = verdictById(review);
  assert.equal(verdicts.get("commitment.book-slot-creates-booking"), "holds");
  assert.equal(verdicts.get("commitment.book-slot-fails-409"), "cannot_verify");

  const sections = specSections(seed, review);
  const bookSlot = sections.find((section) => section.concept.id === "behavior.book-slot");
  assert.deepEqual(bookSlot.requirements.map((req) => req.verdict), ["holds", "cannot_verify"]);

  const noReview = specSections(seed, null);
  assert.equal(noReview[0].requirements[0].verdict, null);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/ui/spec-view.test.js`
Expected: FAIL — `Cannot find module .../src/ui/spec-view.js`

- [ ] **Step 3: Write `src/ui/spec-view.js`**

```js
// The approved spec, presented as a document. Verdicts are joined onto seed
// commitments by id — this module never decides one. Spec answers "what did I
// ask for"; Report answers "is it true". Rows link across, never duplicate.

import { seedRelationText, verdictLabel } from "../reporters/display-language.js";

const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Domain reading order: who acts, what they do, what it touches. Copied rather
// than imported from ../seed/schema.js — the server only serves /reporters/ to
// the browser (src/server/index.js:216), so importing from ../seed/ would 404
// and take the whole module graph down with it. A test pins this to
// CONCEPT_ROLES so the copy cannot drift.
export const ROLE_ORDER = Object.freeze(["actor", "behavior", "resource", "condition", "outcome"]);
const ROLE_RANK = new Map(ROLE_ORDER.map((role, index) => [role, index]));

export function verdictById(review) {
  const verdicts = new Map();
  for (const group of review?.groups ?? []) {
    for (const card of group.cards) verdicts.set(card.id, card.verdict);
  }
  return verdicts;
}

function targetName(target, nameOf) {
  return target?.concept !== undefined ? nameOf(target.concept) : String(target?.literal);
}

export function specSections(seed, review) {
  const nameOf = (id) => seed.concepts.find((concept) => concept.id === id)?.name ?? id;
  const verdicts = verdictById(review);

  const referenced = new Map();
  for (const commitment of seed.commitments) {
    const id = commitment.target?.concept;
    if (id) referenced.set(id, (referenced.get(id) ?? 0) + 1);
  }

  return [...seed.concepts]
    .sort((a, b) => (ROLE_RANK.get(a.role) ?? 99) - (ROLE_RANK.get(b.role) ?? 99) || a.name.localeCompare(b.name))
    .map((concept) => ({
      concept,
      referencedBy: referenced.get(concept.id) ?? 0,
      requirements: seed.commitments
        .filter((commitment) => commitment.source === concept.id)
        .map((commitment) => ({
          id: commitment.id,
          text: `${seedRelationText(commitment.relation)} ${targetName(commitment.target, nameOf)}`,
          note: commitment.note ?? null,
          verdict: verdicts.get(commitment.id) ?? null,
        }))
        .sort((a, b) => a.text.localeCompare(b.text)),
    }));
}

function renderRequirement(requirement) {
  const verdict = requirement.verdict
    ? `<span class="spec-verdict verdict-${esc(requirement.verdict)}">${esc(verdictLabel(requirement.verdict))}</span>`
    : `<span class="spec-verdict spec-unchecked">not checked yet</span>`;
  return `<button class="spec-req" data-goto="${esc(requirement.id)}" title="Open this in the report">` +
    `<span class="spec-req-text">${esc(requirement.text)}</span>${verdict}</button>`;
}

function renderSection(section) {
  const { concept, requirements, referencedBy } = section;
  const body = requirements.length
    ? requirements.map(renderRequirement).join("")
    : `<p class="spec-refs">${referencedBy
        ? `Referenced by ${referencedBy} ${referencedBy === 1 ? "requirement" : "requirements"}.`
        : "Nothing in the spec says anything about this yet."}</p>`;
  return `<section class="spec-section">` +
    `<h3 class="spec-subject">${esc(concept.name)}<span class="role-chip">${esc(concept.role)}</span></h3>` +
    (concept.summary ? `<p class="spec-summary">${esc(concept.summary)}</p>` : "") +
    body + `</section>`;
}

export function renderSpecDoc(seed, review, { query = "" } = {}) {
  const sections = specSections(seed, review);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? sections
        .map((section) => ({
          ...section,
          requirements: section.requirements.filter((req) =>
            `${section.concept.name} ${req.text}`.toLowerCase().includes(needle)),
        }))
        .filter((section) => section.requirements.length || section.concept.name.toLowerCase().includes(needle))
    : sections;

  if (!visible.length) return `<p class="empty-copy">Nothing in your spec matches this search.</p>`;
  return visible.map(renderSection).join("");
}

export function renderSpecNotes(context) {
  if (!context?.length) return "";
  return `<section class="spec-notes"><h3>Notes — recorded, not checked</h3><ul>` +
    context.map((entry) => `<li>${esc(entry.text)}</li>`).join("") + `</ul></section>`;
}
```

- [ ] **Step 4: Run the test**

Run: `node --test test/ui/spec-view.test.js`
Expected: `pass 3`, `fail 0`

Then confirm the browser can actually load the new module — one 404 anywhere in the graph kills the whole app:

Run: `node --test test/server/static-assets.test.js`
Expected: `pass`, with `spec-view.js` walked as part of the served graph.

- [ ] **Step 5: Render it on the page**

In `src/ui/app.js`, add to the import block:

```js
import { renderSpecDoc, renderSpecNotes } from "./spec-view.js";
```

In `renderIntent`, replace the master markup built at `src/ui/app.js:331-350` — the `<h2>Your spec</h2>` heading, `renderSeedStatus`, and the `intent-recon` "Latest check" section — with the document. Keep the composer block for now; Task 4 restyles it.

```js
  const seed = seedData?.seed ?? null;
  let masterHtml = `<div class="spec-doc">`;
  masterHtml += renderSeedStatus(seedData);
  if (seed) masterHtml += renderSpecDoc(seed, reconciliationData?.review, { query: el.search.value });
  masterHtml += /* the `intent-conversation` section from src/ui/app.js:333-342, unchanged */ composerSection;
  masterHtml += renderQuestions(draft?.questions);
  masterHtml += renderUnsupported(draft?.unsupported);
  masterHtml += renderSpecNotes(seed?.context);
  masterHtml += `</div>`;
```

Close the `.spec-doc` wrapper after the draft-review section added in Task 1, so the whole page is one column.

- [ ] **Step 6: Give the document a column**

In `src/ui/styles.css`, add `.spec-doc` to the full-width span list at line 526 (alongside `.report`):

```css
.bento-grid > .map-modes,
.bento-grid > .spec-doc,
.bento-grid > .report {
```

Then append the Spec block near the `.report` block:

```css
/* ---- Spec document ---- */
.spec-doc { max-width: 78ch; padding-top: 4px; }
.spec-section { margin: 0 0 22px; }
.spec-subject { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; font-size: 15px; }
/* Chrome, not meaning: a role is a category, not a verdict, so it carries no hue. */
.role-chip { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-mid); }
.spec-summary { margin: 0 0 8px; color: var(--text-mid); font-size: 13px; }
.spec-refs { margin: 0 0 8px; color: var(--text-dim); font-size: 13px; }
.spec-req {
  display: flex; align-items: baseline; gap: 12px; width: 100%; text-align: left;
  padding: 8px 12px; margin-bottom: 4px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg-card); color: inherit; font: inherit;
}
.spec-req:hover { border-color: var(--border-bright); }
.spec-req-text { flex: 1; min-width: 0; }
.spec-verdict { font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; white-space: nowrap; }
.spec-unchecked { color: var(--text-dim); }
.spec-notes { max-width: 72ch; margin-top: 22px; color: var(--text-mid); font-size: 13px; }
.spec-notes li { margin: 6px 0; }
```

`.verdict-holds` / `.verdict-violated` / `.verdict-cannot_verify` / `.verdict-not_checkable` already exist from the Phase 5 token work — `.spec-verdict` inherits them by class stacking.

- [ ] **Step 7: Verify by hand**

Reload Spec on the pilot.
Expected: **Member** (actor) with three `can …` rows marked *noted*; **Book Slot** (behavior) with `accepts BookingRequest — confirmed`, `creates Booking — confirmed`, `fails with 409`; resources listed with reference counts; the three context notes at the bottom. All 11 concepts and 17 requirements visible.

- [ ] **Step 8: Commit**

```bash
git add src/ui/spec-view.js test/ui/spec-view.test.js src/ui/app.js src/ui/styles.css
git commit -m "feat(ui): show the approved spec as a document with live verdicts"
```

---

## Task 3: Header band, working search, and the link to Report

**Files:**
- Modify: `src/ui/spec-view.js`, `src/ui/app.js`, `src/ui/styles.css`

- [ ] **Step 1: Add the header band to `src/ui/spec-view.js`**

```js
import { shortHash } from "./intent-view.js";

// Replaces the three-card row: identity, approval state, and one honest tally
// that hands off to Report rather than re-answering it.
export function renderSpecHeader(seedData, summary) {
  const seed = seedData?.seed;
  if (!seed) return "";
  const approved = seedData.ratified;
  const when = seed.ratification?.ratifiedAt
    ? new Date(seed.ratification.ratifiedAt).toLocaleString()
    : null;
  const meta = [
    `<span class="seed-hash" title="${esc(seedData.contentHash ?? "")}">${esc(shortHash(seedData.contentHash))}</span>`,
    when ? `<span>approved ${esc(when)}</span>` : null,
    seedData.gitDirty ? `<span class="seed-badge git-dirty">uncommitted changes</span>` : null,
  ].filter(Boolean).join("<span class=\"dot\">·</span>");

  const counts = `${seed.commitments.length} ${seed.commitments.length === 1 ? "requirement" : "requirements"} ` +
    `about ${seed.concepts.length} ${seed.concepts.length === 1 ? "thing" : "things"}.`;
  const tally = summary
    ? `<p class="spec-tally">${counts} ` +
      `<span class="verdict-holds">${summary.holds} confirmed</span> · ` +
      `<span class="verdict-violated">${summary.violated} missing</span> · ` +
      `<span class="verdict-cannot_verify">${summary.cannotVerify} couldn't tell</span> · ` +
      `<span class="verdict-not_checkable">${summary.notCheckable} noted</span>` +
      ` <button class="spec-goto-report" data-goto-report type="button">See the report →</button></p>`
    : `<p class="spec-tally">${counts}</p>`;

  return `<header class="spec-head">` +
    `<h2>${esc(seed.system?.name ?? "Untitled system")}` +
    `<span class="seed-badge ${approved ? "ratified" : "draft"}">${approved ? "approved" : "draft"}</span></h2>` +
    `<p class="spec-meta">${meta}</p>${tally}</header>`;
}
```

- [ ] **Step 2: Swap it in and make search real**

In `src/ui/app.js`'s `renderIntent`, replace the `showSearch(...)` call at `src/ui/app.js:326` and the `renderSeedStatus(seedData)` line:

```js
  showSearch("Search your spec…");
  const seed = seedData?.seed ?? null;
  const matches = seed ? countSpecMatches(seed, el.search.value) : 0;
  el.searchCount.textContent = el.search.value.trim() && seed ? `${matches} matching` : "";
```

and use `renderSpecHeader(seedData, reconciliationData?.report?.summary)` where `renderSeedStatus` was. Keep `renderSeedStatus` only for the invalid/empty branches — it is the one place that lists validation problems.

Add the small counter helper next to `renderIntent`:

```js
function countSpecMatches(seed, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const nameOf = (id) => seed.concepts.find((concept) => concept.id === id)?.name ?? id;
  return seed.commitments.filter((commitment) =>
    `${nameOf(commitment.source)} ${commitment.relation} ${commitment.target?.concept ?? commitment.target?.literal ?? ""}`
      .toLowerCase().includes(needle)).length;
}
```

- [ ] **Step 3: Wire the cross-links**

Add to `src/ui/app.js`, and call `bindSpecLinks()` at the end of `renderIntent`:

```js
// Spec hands off to Report rather than duplicating its evidence UI. data-goto is
// deliberately not data-expand: bindExpanders() binds that globally.
function bindSpecLinks() {
  const openReport = (id) => {
    activeView = "review";
    expandedId = id ?? null;
    el.search.value = "";
    if (el.searchClear) el.searchClear.hidden = true;
    render();
    document.querySelector(".req-row.open")?.scrollIntoView({ block: "center" });
  };
  document.querySelectorAll("[data-goto]").forEach((button) =>
    button.addEventListener("click", () => openReport(button.dataset.goto)));
  document.querySelector("[data-goto-report]")?.addEventListener("click", () => openReport(null));
}
```

- [ ] **Step 4: Style the header**

Append to the Spec block in `src/ui/styles.css`:

```css
.spec-head { max-width: 72ch; margin: 0 0 26px; }
.spec-head h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 6px; }
.spec-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin: 0 0 10px; color: var(--text-mid); font-size: 12.5px; }
.spec-meta .dot { color: var(--text-dim); }
.spec-tally { margin: 0; font-size: 13.5px; color: var(--text-mid); }
.spec-goto-report { border: 0; background: none; padding: 0 0 0 6px; cursor: pointer;
  color: var(--accent); font: inherit; font-size: 13px; }
.spec-goto-report:hover { text-decoration: underline; }
```

- [ ] **Step 5: Verify by hand**

Expected: header reads `Slotkeeper [approved]` / `01e6f3d2 · approved <date>` / `17 requirements about 11 things. 12 confirmed · 0 missing · 1 couldn't tell · 4 noted  See the report →`. Typing `book` filters the document and shows a count. Clicking a requirement lands on Report with that row open and scrolled into view.

- [ ] **Step 6: Commit**

```bash
git add src/ui/spec-view.js src/ui/app.js src/ui/styles.css
git commit -m "feat(ui): give Spec a header band, working search, and a link into Report"
```

---

## Task 4: Change flow as a state, and the empty state

**Files:**
- Modify: `src/ui/app.js`, `src/ui/styles.css`, `src/ui/intent-view.js`

- [ ] **Step 1: Make `renderIntent` a three-state switch**

Restructure the body of `renderIntent` so the page renders exactly one of:

```js
  // 1. No spec at all — one call to action, not a grid of empty cards.
  if (!seed && !draft?.draft) {
    renderPanes(`<div class="spec-doc"><div class="spec-onboard">` +
      `<h2>varai has nothing to check against yet</h2>` +
      `<p class="empty-copy">A spec is the list of things this system must do, in your words. ` +
      `varai checks the code against it and never edits either one.</p>` +
      renderSeedStatus(seedData) + composerHtml(assistant) +
      `</div></div>`, "", { inlineExpand: true });
    bindComposer();
    return;
  }

  // 2. A draft is under review — the whole page becomes the decision.
  // 3. Otherwise the approved document, with the composer collapsed beneath it.
```

- [ ] **Step 2: Demote the composer, promote what works**

Extract the composer into a helper. When no assistant is configured, Import becomes the primary action instead of the assistant's absence being announced in the primary slot:

```js
function composerHtml(assistant) {
  const body = assistant
    ? `<textarea id="intent-message" rows="4" placeholder="Describe what the system must do, in your own words…"></textarea>` +
      `<div class="intent-actions">` +
      `<button id="intent-ask" class="intent-ask" type="button">Ask ${esc(assistant.provider)} · ${esc(assistant.model)}</button>` +
      `</div>` +
      `<details class="intent-import"><summary>Import a proposal JSON</summary>${importHtml()}</details>`
    : importHtml() + `<p class="intent-note">No AI drafting assistant is configured, so proposals are imported by hand.</p>`;
  return `<details class="spec-compose"><summary>Propose a change</summary>${body}</details>`;
}

function importHtml() {
  return `<textarea id="intent-proposal" rows="8" placeholder='{"draft": {…}, "questions": [], "unsupported": []}'></textarea>` +
    `<button id="intent-import-btn" type="button">Import proposal</button>`;
}
```

Move the four existing `$("intent-…")?.addEventListener` blocks (`src/ui/app.js:361-395`) into `bindComposer()` so every state can bind them with one call.

- [ ] **Step 3: Make the approve bar sticky**

In `src/ui/styles.css`:

```css
.spec-compose { max-width: 72ch; margin: 24px 0; }
.spec-compose > summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
.spec-onboard { max-width: 56ch; margin: 8vh auto 0; text-align: center; }
.spec-review { max-width: 78ch; }
/* The decision stays reachable however long the diff runs. */
.spec-review .intent-actions {
  position: sticky; bottom: 0; z-index: 1;
  margin: 0; padding: 12px 0;
  background: var(--bg); border-top: 1px solid var(--border);
}
```

- [ ] **Step 4: Put the diff colors on the verdict tokens**

Replace `src/ui/styles.css:1573` and `:1581-1583` — these hardcoded hex values are near-invisible on the dark ground:

```css
.intent-ratify { background: var(--verdict-confirmed); color: #fff; border-color: var(--verdict-confirmed); }
.diff-added { color: var(--verdict-confirmed); }
.diff-removed { color: var(--verdict-missing); }
.diff-changed { color: var(--verdict-unknown); }
```

- [ ] **Step 5: Run the suite and verify all three states**

Run: `node --test`
Expected: `pass 337`, `fail 0`

By hand on the pilot: the approved document with **Propose a change** collapsed beneath it; import a proposal and confirm the page becomes the review with a sticky Approve bar; `mv varai.seed.json varai.seed.json.bak` and reload to confirm the onboarding state, then restore it.

- [ ] **Step 6: Commit**

```bash
git add src/ui/app.js src/ui/styles.css src/ui/intent-view.js
git commit -m "feat(ui): make the Spec page's change flow a state, not a card"
```

---

## Out of scope, deliberately

- **Editing the spec in place.** Every change still goes through draft → review → approve; that is ADR 0005, not a UI limitation.
- **Typography.** `src/ui/index.html:9` loads Inter from Google Fonts, which is the largest single reason the app reads as generic. Worth its own change; changing it here would make every visual diff in this plan unreadable.
- **Server changes.** Verdicts are joined in the browser from data `/api/reconciliation` already returns.
