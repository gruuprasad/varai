# Spec Evidence Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a Spec requirement opens Report’s evidence card in a split pane on Spec — Spec stays selected; no nav jump to Report.

**Architecture:** Keep Spec on the grid layer (`inlineExpand: true`). Wrap the approved document and a new evidence column in `.spec-split`. Export Report’s `renderRowDetail` plus `findCard` so both views share one card. Spec rows switch from `data-goto` to `data-expand`; only the header “See the report →” switches to Report (preserving `expandedId` when set).

**Tech Stack:** Vanilla ES modules in `src/ui` (no build step), `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-23-spec-evidence-pane-design.md`

**Worktree:** Product UI work — create/enter a worktree off `origin/main` before Task 1 (session-workflow). Do not implement on the shared `main` checkout.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/ui/report-view.js` | Export `findCard(review, id)` and `renderRowDetail(card)` (already exists, currently private) |
| `src/ui/spec-view.js` | Rows use `data-expand` + selected state; add `requirementVisible`, `renderSpecEvidence` |
| `src/ui/app.js` | Approved Spec renders `.spec-split`; clear selection when search hides the open row; `bindSpecLinks` only for Report header |
| `src/ui/styles.css` | `.spec-split` side-by-side / stacked; selected row; evidence column chrome |
| `test/ui/report-view.test.js` | `findCard` + shared detail columns |
| `test/ui/spec-view.test.js` | `data-expand` markup, visibility helper, evidence pane HTML |

No server, seed, or reconciliation changes.

---

### Task 1: Share Report’s evidence card

**Files:**
- Modify: `src/ui/report-view.js`
- Modify: `test/ui/report-view.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/ui/report-view.test.js`:

```js
import { bucketCards, findCard, headlineSentence, renderRowDetail, requirementSentence } from "../../src/ui/report-view.js";

const detailCard = {
  id: "c.holds",
  verdict: "holds",
  relation: "creates",
  sourceName: "Book Slot",
  targetName: "Booking",
  reasons: [],
  bindings: [{ concept: "behavior.book-slot", state: "resolved", elements: [{ name: "POST /api/bookings" }] }],
  claims: [{ targetName: "Booking", claimState: "present", evidence: [{ file: "backend/app/main.py", line: 25 }], implementationPath: [] }],
  readingOrder: [{ why: "INTERFACE", file: "backend/app/main.py", line: 25 }],
};

test("findCard locates a requirement by commitment id across groups", () => {
  assert.equal(findCard(review, "c.holds")?.verdict, "holds");
  assert.equal(findCard(review, "missing-id"), null);
  assert.equal(findCard(null, "c.holds"), null);
});

test("renderRowDetail is the shared You asked / builder / varai found card", () => {
  const html = renderRowDetail(detailCard);
  assert.match(html, /You asked/);
  assert.match(html, /The builder says/);
  assert.match(html, /varai found/);
  assert.match(html, /Suggested code-reading order/);
  assert.match(html, /POST \/api\/bookings/);
  assert.match(html, /backend\/app\/main\.py/);
});
```

Keep the existing import line’s other symbols; merge into one import as above.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ui/report-view.test.js`

Expected: FAIL — `findCard` / `renderRowDetail` are not exported (or not defined).

- [ ] **Step 3: Export `findCard` and `renderRowDetail`**

In `src/ui/report-view.js`, add above `renderRowDetail`:

```js
export function findCard(review, id) {
  if (!review || id == null) return null;
  for (const group of review.groups ?? []) {
    const card = group.cards.find((item) => item.id === id);
    if (card) return card;
  }
  return null;
}
```

Change `function renderRowDetail(card)` to `export function renderRowDetail(card)`. Leave the function body unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/ui/report-view.test.js`

Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/ui/report-view.js test/ui/report-view.test.js
git commit -m "$(cat <<'EOF'
feat(ui): export Report evidence card for Spec to reuse

EOF
)"
```

---

### Task 2: Spec rows expand in place (markup)

**Files:**
- Modify: `src/ui/spec-view.js`
- Modify: `test/ui/spec-view.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/ui/spec-view.test.js`:

```js
import { countSpecMatches, renderSpecDoc, requirementVisible, ROLE_ORDER, specSections, verdictById } from "../../src/ui/spec-view.js";

test("requirement rows open evidence via data-expand, not data-goto", () => {
  const html = renderSpecDoc(seed, review);
  assert.match(html, /data-expand="commitment\.book-slot-creates-booking"/);
  assert.doesNotMatch(html, /data-goto=/);
});

test("the open requirement is marked selected", () => {
  const html = renderSpecDoc(seed, review, { expandedId: "commitment.book-slot-creates-booking" });
  assert.match(html, /spec-req selected[^>]*data-expand="commitment\.book-slot-creates-booking"/);
});

test("requirementVisible is false when search hides the open row", () => {
  assert.equal(requirementVisible(seed, review, "", "commitment.book-slot-creates-booking"), true);
  assert.equal(requirementVisible(seed, review, "Member", "commitment.book-slot-creates-booking"), false);
  assert.equal(requirementVisible(seed, review, "creates", "commitment.book-slot-creates-booking"), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ui/spec-view.test.js`

Expected: FAIL — still `data-goto`, no `requirementVisible`, no selected class.

- [ ] **Step 3: Update Spec row rendering**

In `src/ui/spec-view.js`, replace the module header comment’s last sentence with: Spec shows the document; the evidence pane (wired in `app.js`) reuses Report’s card — rows select via `data-expand`, and only “See the report →” leaves Spec.

Replace `renderRequirement` and `renderSpecDoc` as follows:

```js
function renderRequirement(requirement, expandedId) {
  const verdict = requirement.verdict
    ? `<span class="spec-verdict verdict-${esc(requirement.verdict)}">${esc(verdictLabel(requirement.verdict))}</span>`
    : `<span class="spec-verdict spec-unchecked">not checked yet</span>`;
  const selected = requirement.id === expandedId;
  return `<button class="spec-req${selected ? " selected" : ""}" data-expand="${esc(requirement.id)}" ` +
    `aria-expanded="${selected}" title="Show why varai scored this">` +
    `<span class="spec-req-text">${esc(requirement.text)}` +
    (requirement.note ? `<span class="spec-req-note">${esc(requirement.note)}</span>` : "") +
    `</span>${verdict}</button>`;
}

function renderSection(section, expandedId) {
  const { concept, requirements, referencedBy } = section;
  const body = requirements.length
    ? requirements.map((requirement) => renderRequirement(requirement, expandedId)).join("")
    : `<p class="spec-refs">${referencedBy
        ? `Referenced by ${referencedBy} ${referencedBy === 1 ? "requirement" : "requirements"}.`
        : "Nothing in the spec says anything about this yet."}</p>`;
  return `<section class="spec-section">` +
    `<h3 class="spec-subject">${esc(concept.name)}<span class="role-chip">${esc(concept.role)}</span></h3>` +
    (concept.summary ? `<p class="spec-summary">${esc(concept.summary)}</p>` : "") +
    body + `</section>`;
}

export function renderSpecDoc(seed, review, { query = "", expandedId = null } = {}) {
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
  return visible.map((section) => renderSection(section, expandedId)).join("");
}

// Used by app.js to drop the evidence pane when search filters out the open row.
export function requirementVisible(seed, review, query, id) {
  if (!id) return false;
  const sections = specSections(seed, review);
  const needle = query.trim().toLowerCase();
  for (const section of sections) {
    for (const req of section.requirements) {
      if (req.id !== id) continue;
      if (!needle) return true;
      return `${section.concept.name} ${req.text}`.toLowerCase().includes(needle);
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/ui/spec-view.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spec-view.js test/ui/spec-view.test.js
git commit -m "$(cat <<'EOF'
feat(ui): Spec requirements select via data-expand

EOF
)"
```

---

### Task 3: Evidence pane renderer

**Files:**
- Modify: `src/ui/spec-view.js`
- Modify: `test/ui/spec-view.test.js`

- [ ] **Step 1: Write the failing test**

Extend the existing `spec-view.js` import in `test/ui/spec-view.test.js` to include `renderSpecEvidence`, then append:

```js
test("renderSpecEvidence shows the shared card or an honest placeholder", () => {
  const richReview = {
    groups: [{
      concept: "behavior.book-slot",
      cards: [{
        id: "commitment.book-slot-creates-booking",
        verdict: "holds",
        relation: "creates",
        sourceName: "Book Slot",
        targetName: "Booking",
        reasons: [],
        bindings: [{ concept: "behavior.book-slot", state: "resolved", elements: [{ name: "createBooking" }] }],
        claims: [{ targetName: "Booking", claimState: "present", evidence: [], implementationPath: [] }],
        readingOrder: [],
      }],
    }],
  };
  const open = renderSpecEvidence(richReview, "commitment.book-slot-creates-booking");
  assert.match(open, /spec-evidence/);
  assert.match(open, /data-collapse-evidence/);
  assert.match(open, /You asked/);
  assert.match(open, /Book Slot creates Booking/);

  const empty = renderSpecEvidence(richReview, null);
  assert.match(empty, /Pick a requirement/);
  assert.doesNotMatch(empty, /You asked/);

  const scanning = renderSpecEvidence(null, "commitment.book-slot-creates-booking");
  assert.match(scanning, /not ready|Waiting|scan/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ui/spec-view.test.js`

Expected: FAIL — `renderSpecEvidence` is not exported.

- [ ] **Step 3: Implement `renderSpecEvidence`**

Add this import next to the existing imports in `src/ui/spec-view.js` (`verdictLabel` stays on the `display-language.js` import):

```js
import { findCard, renderRowDetail, requirementSentence } from "./report-view.js";
```

Add at the bottom of the file (or after `renderSpecNotes`):

```js
export function renderSpecEvidence(review, expandedId) {
  if (!expandedId) {
    return `<aside class="spec-evidence">` +
      `<p class="empty-copy">Pick a requirement to see why varai scored it.</p>` +
      `</aside>`;
  }
  if (!review) {
    return `<aside class="spec-evidence">` +
      `<div class="spec-evidence-head"><span class="spec-evidence-label">Evidence</span></div>` +
      `<p class="empty-copy">The check is not ready yet.</p>` +
      `</aside>`;
  }
  const card = findCard(review, expandedId);
  if (!card) {
    return `<aside class="spec-evidence">` +
      `<div class="spec-evidence-head">` +
      `<span class="spec-evidence-label">Evidence</span>` +
      `<button type="button" class="spec-evidence-close" data-collapse-evidence aria-label="Close">✕</button>` +
      `</div>` +
      `<p class="empty-copy">No check result for this requirement.</p>` +
      `</aside>`;
  }
  return `<aside class="spec-evidence">` +
    `<div class="spec-evidence-head">` +
    `<span class="spec-evidence-label">Evidence</span>` +
    `<button type="button" class="spec-evidence-close" data-collapse-evidence aria-label="Close">✕</button>` +
    `</div>` +
    `<div class="spec-evidence-title">` +
    `<span class="spec-verdict verdict-${esc(card.verdict)}">${esc(verdictLabel(card.verdict))}</span>` +
    `<p>${esc(requirementSentence(card))}</p>` +
    `</div>` +
    renderRowDetail(card) +
    `</aside>`;
}
```

Note: `renderRowDetail` already includes a “You asked” section — the title above is Spec chrome (verdict + sentence), not a second truth story. Keep it short.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/ui/spec-view.test.js test/ui/report-view.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/spec-view.js test/ui/spec-view.test.js
git commit -m "$(cat <<'EOF'
feat(ui): render Spec evidence pane from Report's card

EOF
)"
```

---

### Task 4: Wire Spec split in `app.js`

**Files:**
- Modify: `src/ui/app.js`

- [ ] **Step 1: Update imports**

Where `spec-view.js` is imported, extend to:

```js
import {
  countSpecMatches, renderSpecDoc, renderSpecEvidence, renderSpecHeader, renderSpecNotes, requirementVisible,
} from "./spec-view.js";
```

- [ ] **Step 2: Rewrite the approved Spec branch in `renderIntent`**

Replace the State 3 block (approved document) so it clears a hidden selection, builds the split, and keeps using `inlineExpand: true`:

```js
  // State 3: the approved document + evidence pane. Stays on Spec; Report is
  // only reached via "See the report →".
  showSearch("Search your spec…");
  const query = el.search.value;
  el.searchCount.textContent = query.trim() ? `${countSpecMatches(seed, query)} matching` : "";

  const review = reconciliationData?.review ?? null;
  if (expandedId && !requirementVisible(seed, review, query, expandedId)) {
    expandedId = null;
  }

  const documentHtml =
    renderSpecHeader(seedData, reconciliationData?.report?.summary) +
    renderSpecDoc(seed, review, { query, expandedId }) +
    renderSpecNotes(seed.context) +
    composerMarkup(assistant);

  renderPanes(
    `<div class="spec-split">` +
      `<div class="spec-doc">${documentHtml}</div>` +
      renderSpecEvidence(review, expandedId) +
    `</div>`,
    "",
    { inlineExpand: true },
  );
  bindSpecLinks();
  bindComposer(draft);
```

`bindExpanders()` is already called from `renderPanes` — Spec rows with `data-expand` will toggle `expandedId` with no further wiring.

- [ ] **Step 3: Fix `bindSpecLinks` — header only, keep selection**

Replace `bindSpecLinks` with:

```js
// Only the explicit Report link leaves Spec. Requirement rows use data-expand
// (bindExpanders) so evidence opens in the Spec pane.
function bindSpecLinks() {
  document.querySelector("[data-goto-report]")?.addEventListener("click", () => {
    activeView = "review";
    // Keep expandedId so Report lands on the same card when one was open.
    el.search.value = "";
    if (el.searchClear) el.searchClear.hidden = true;
    render();
    document.querySelector(".req-row.open")?.scrollIntoView({ block: "center" });
  });
  document.querySelector("[data-collapse-evidence]")?.addEventListener("click", () => {
    expandedId = null;
    render();
  });
}
```

Remove the old `[data-goto]` listeners entirely.

- [ ] **Step 4: Run unit tests**

Run: `node --test test/ui/spec-view.test.js test/ui/report-view.test.js`

Expected: PASS.

Run: `node --test`

Expected: pass, fail 0 (full suite).

- [ ] **Step 5: Commit**

```bash
git add src/ui/app.js
git commit -m "$(cat <<'EOF'
feat(ui): keep Spec selected when opening requirement evidence

EOF
)"
```

---

### Task 5: Split-pane CSS

**Files:**
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Let the split span the bento grid**

In the `.bento-grid > …` list (~line 526), change `.spec-doc` to `.spec-split`:

```css
.bento-grid > .group-heading,
.bento-grid > .change-strip,
.bento-grid > .baseline-note,
.bento-grid > .empty-copy,
.bento-grid > .empty-state,
.bento-grid > .map-modes,
.bento-grid > .spec-split,
.bento-grid > .report {
  grid-column: 1 / -1;
}
```

Onboarding / draft review still render a lone `.spec-doc` as the grid child — keep a span rule for that too:

```css
.bento-grid > .spec-doc {
  grid-column: 1 / -1;
}
```

- [ ] **Step 2: Add split + evidence + selected styles**

After the `/* ---- Spec document ---- */` block’s `.spec-doc` rule, add:

```css
.spec-split {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-height: 0;
  width: 100%;
}
.spec-split > .spec-doc {
  flex: 1 1 52%;
  min-width: 0;
  max-width: none;
  padding-right: 20px;
  border-right: 1px solid var(--border);
}
.spec-evidence {
  flex: 1 1 48%;
  min-width: 0;
  max-width: 56ch;
  padding: 4px 4px 32px 20px;
  position: sticky;
  top: 0;
  align-self: start;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
.spec-evidence-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.spec-evidence-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.spec-evidence-close {
  border: 0;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font: inherit;
  padding: 4px 6px;
}
.spec-evidence-close:hover { color: var(--text-bright); }
.spec-evidence-title {
  margin: 0 0 12px;
}
.spec-evidence-title p {
  margin: 6px 0 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-bright);
}
/* Inside the pane, Report's row chrome is redundant — drop the top border. */
.spec-evidence .req-detail { border-top: 0; margin-top: 0; }
.spec-req.selected {
  border-color: var(--accent-border);
  background: var(--bg-active);
}
```

Inside the existing `@media (max-width: 860px)` block, add:

```css
  .spec-split { flex-direction: column; }
  .spec-split > .spec-doc {
    border-right: 0;
    padding-right: 0;
    border-bottom: 1px solid var(--border);
    padding-bottom: 16px;
  }
  .spec-evidence {
    max-width: none;
    padding: 16px 0 28px;
    position: static;
    max-height: none;
  }
```

- [ ] **Step 3: Visual check**

Run: `node bin/varai.js start ../varai-slotkeeper-pilot --no-open` (or the pilot path on this machine), open Spec.

Expected:
- Spec document left, empty evidence placeholder right
- Click “accepts BookingRequest” → Spec nav stays selected; pane shows You asked / builder / varai found
- Esc or ✕ closes the pane
- “See the report →” with a row open → Report with that row expanded
- Narrow the window → stack, evidence under the document

- [ ] **Step 4: Full test suite**

Run: `node --test`

Expected: pass, fail 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/styles.css
git commit -m "$(cat <<'EOF'
style(ui): Spec document + evidence split pane

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Split pane on Spec, Spec stays selected | Task 4–5 |
| Same evidence card as Report | Task 1, 3 |
| Report unchanged as verdict-first home | No Report layout tasks |
| Rows no longer jump to Report | Task 2, 4 (`data-expand`, `bindSpecLinks`) |
| “See the report →” keeps open id | Task 4 |
| Esc / ✕ / re-click clear | Task 4 + existing `bindExpanders` / Escape handler |
| Search clears hidden selection | Task 2 `requirementVisible` + Task 4 |
| Draft / onboarding: no evidence pane | Task 4 only changes State 3 |
| Unchecked / missing honesty via same card | Task 3 uses `renderRowDetail` |
| Seed Studio out of scope | Not in any task |

No TBD/placeholder steps. Names are consistent: `findCard`, `renderRowDetail`, `renderSpecEvidence`, `requirementVisible`, `data-collapse-evidence`.
