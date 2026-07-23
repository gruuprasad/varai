# Code Map & Changes Grid-Layer Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Code map tabs and Changes open detail in a Spec-style side column so search, mode tabs, and the card list stay visible — no focus-layer full-page swap.

**Architecture:** Add a pure `renderViewSplit(masterHtml, detailHtml)` helper that wraps list + detail in `.view-split`. Wire Areas, Subjects, Capabilities, Everything, and Changes through `renderPanes(splitHtml, "", { inlineExpand: true })` so the focus layer never activates. Reuse existing detail HTML; only change where it mounts. Leave Spec’s `.spec-split` alone this pass (same pattern, separate class). Leave focus-layer DOM in place but unused by these views.

**Tech Stack:** Vanilla ES modules in `src/ui` (no build step), `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-23-code-map-split-pane-design.md`

**Worktree:** Product UI work — create/enter a worktree off `origin/main` before Task 1 (session-workflow). Do not implement on the shared `main` checkout.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/ui/view-split.js` | **new** — `renderViewSplit(masterHtml, detailHtml)` pure HTML helper |
| `test/ui/view-split.test.js` | **new** — markup contract for the split |
| `src/ui/styles.css` | `.view-split` layout (mirror Spec split); master column recreates card grid; bento span + narrow stack |
| `src/ui/app.js` | Wire Areas / Subjects / Capabilities / Everything / Changes through the split + `inlineExpand: true` |

No changes to `observed-areas-view.js` detail renderers (they already return `masterHtml` + `detailHtml`). No Report / Spec behavior changes. No analyzer changes.

**Important layout note:** Today cards are *direct* children of `.bento-grid` (multi-column). After the split, cards live inside `.view-split-master`, so that column must recreate the card grid (`repeat(auto-fill, minmax(280px, 1fr))`). Mode tabs and change strips stay *outside* the split as full-width bento children.

---

### Task 1: `renderViewSplit` helper

**Files:**
- Create: `src/ui/view-split.js`
- Create: `test/ui/view-split.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/ui/view-split.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { renderViewSplit } from "../../src/ui/view-split.js";

test("renderViewSplit wraps master and detail in a grid-layer split", () => {
  const html = renderViewSplit(`<article class="card">A</article>`, `<div class="detail-content">B</div>`);
  assert.match(html, /class="view-split"/);
  assert.match(html, /view-split-master/);
  assert.match(html, /view-split-detail/);
  assert.match(html, /<article class="card">A<\/article>/);
  assert.match(html, /<div class="detail-content">B<\/div>/);
  // Master comes before detail.
  assert.ok(html.indexOf("view-split-master") < html.indexOf("view-split-detail"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ui/view-split.test.js`

Expected: FAIL — module not found / `renderViewSplit` missing.

- [ ] **Step 3: Implement the helper**

Create `src/ui/view-split.js`:

```js
// Grid-layer master + detail side by side. Callers pass the result as
// renderPanes' master HTML with { inlineExpand: true } so the focus layer
// never activates. Detail content is unchanged — only placement changes.
export function renderViewSplit(masterHtml, detailHtml) {
  return `<div class="view-split">` +
    `<div class="view-split-master">${masterHtml}</div>` +
    `<div class="view-split-detail">${detailHtml}</div>` +
  `</div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ui/view-split.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view-split.js test/ui/view-split.test.js
git commit -m "$(cat <<'EOF'
feat(ui): add shared grid-layer view split helper

EOF
)"
```

---

### Task 2: Split-pane CSS

**Files:**
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Span `.view-split` in the bento grid**

In the `.bento-grid > …` full-width list (~line 526), add `.view-split` next to `.spec-split`:

```css
.bento-grid > .group-heading,
.bento-grid > .change-strip,
.bento-grid > .baseline-note,
.bento-grid > .empty-copy,
.bento-grid > .empty-state,
.bento-grid > .map-modes,
.bento-grid > .spec-split,
.bento-grid > .view-split,
.bento-grid > .report {
  grid-column: 1 / -1;
}
```

- [ ] **Step 2: Add `.view-split` layout (after `.map-modes` block, before Spec block)**

```css
/* ---- Grid-layer list + detail (Code map, Changes) ---- */
.view-split {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-height: 0;
  width: 100%;
}
.view-split-master {
  flex: 1 1 52%;
  min-width: 0;
  padding-right: 20px;
  border-right: 1px solid var(--border);
  /* Cards used to be direct .bento-grid children; recreate that grid here. */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  align-content: start;
}
.view-split-master > .group-heading,
.view-split-master > .subgroup-heading,
.view-split-master > .empty-copy,
.view-split-master > .empty-state {
  grid-column: 1 / -1;
}
.view-split-detail {
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
```

- [ ] **Step 3: Narrow stack — after the new block, add a media query that wins the cascade**

Place this *immediately after* the `.view-split-detail` rules (not inside the earlier `@media` block near line 1497 — Spec already hit that cascade bug):

```css
@media (max-width: 860px) {
  .view-split { flex-direction: column; }
  .view-split-master {
    border-right: 0;
    padding-right: 0;
    border-bottom: 1px solid var(--border);
    padding-bottom: 16px;
  }
  .view-split-detail {
    max-width: none;
    padding: 16px 0 28px;
    position: static;
    max-height: none;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/styles.css
git commit -m "$(cat <<'EOF'
style(ui): grid-layer split pane for Code map and Changes

EOF
)"
```

---

### Task 3: Wire Observed Areas (Code map → Areas)

**Files:**
- Modify: `src/ui/app.js`

- [ ] **Step 1: Import the helper**

Near the top of `src/ui/app.js`, add:

```js
import { renderViewSplit } from "./view-split.js";
```

- [ ] **Step 2: Change the Areas `renderPanes` call**

In `renderSystem` / Observed Areas path (the call that currently does
`renderPanes(renderMapModes() + strip + (rendered.masterHtml || rendered.html), rendered.detailHtml)` with no `inlineExpand`), replace with:

```js
  renderPanes(
    renderMapModes() + strip + renderViewSplit(rendered.masterHtml || rendered.html, rendered.detailHtml),
    "",
    { inlineExpand: true },
  );
```

Leave `bindMapModes` and the change-strip listener as they are.

- [ ] **Step 3: Run Observed Areas + split tests**

Run: `node --test test/ui/view-split.test.js test/ui/observed-areas-view.test.js`

Expected: PASS (outline tests still assert `masterHtml` / `detailHtml` separately; app wiring is not unit-tested there).

- [ ] **Step 4: Commit**

```bash
git add src/ui/app.js
git commit -m "$(cat <<'EOF'
feat(ui): open Observed Areas detail in a side column

EOF
)"
```

---

### Task 4: Wire Subjects, Capabilities, and Everything

**Files:**
- Modify: `src/ui/app.js`

Each of these currently calls `renderPanes(masterHtml, detailHtml)` without `inlineExpand`, which activates the focus layer when `expandedId` is set. Wrap the **card list** (not the mode strip) in `renderViewSplit`, pass empty focus detail, and set `inlineExpand: true`.

- [ ] **Step 1: Subjects (`renderSubjects`)**

Find the block that builds `masterHtml` starting with `renderMapModes() + strip + …` and ends with `renderPanes(masterHtml, detailHtml)`. Change it so modes/strip stay outside the split:

```js
  let listHtml = `<h2 class="group-heading">Subjects</h2>`;
  listHtml += subjects.length
    ? subjects.map((root) => subjectMasterCard(root, byId, changed)).join("")
    : `<p class="empty-copy">No system subjects recovered.</p>`;
  listHtml += `<h2 class="group-heading">Screens</h2>`;
  listHtml += screens.length
    ? screens.map((root) => screenMasterCard(root, byId, changed)).join("")
    : `<p class="empty-copy">No screens recovered.</p>`;
  if (unplaced.length) {
    listHtml += `<h3 class="subgroup-heading">Not placed on a screen</h3>` +
      unplaced.map((root) => subjectMasterCard(root, byId, changed)).join("");
  }

  const selectedRoot = allRoots.find((r) => r.elementId === expandedId);
  let detailHtml = "";
  if (selectedRoot) {
    const isScreen = byId.get(selectedRoot.elementId)?.kind === "screen";
    detailHtml = isScreen
      ? screenDetail(selectedRoot, byId, claimsBySource, changed)
      : subjectDetail(selectedRoot, byId, claimsBySource, changed);
  } else {
    detailHtml = emptyDetailPlaceholder("Select a Subject or Screen", "Select a subject or screen from the list to view detailed behaviors.");
  }

  renderPanes(
    renderMapModes() + strip + renderViewSplit(listHtml, detailHtml),
    "",
    { inlineExpand: true },
  );
  bindMapModes();
  $("change-strip")?.addEventListener("click", () => { changesOnly = !changesOnly; render(); });
```

Remove the old `masterHtml`-based `renderPanes(masterHtml, detailHtml)` call.

- [ ] **Step 2: Capabilities (`renderCapabilities`)**

Same pattern: build `listHtml` from the envelope + behavior card markup (everything that is currently in `masterHtml` *after* `renderMapModes()`), keep `detailHtml` as today, then:

```js
  renderPanes(
    renderMapModes() + renderViewSplit(listHtml, detailHtml),
    "",
    { inlineExpand: true },
  );
  bindMapModes();
```

Do not change how `detailHtml` is composed (`envelopeDetail` / behavior detail / placeholder).

- [ ] **Step 3: Everything (`renderEverything`)**

Empty-search branch — keep modes reachable, still use the split with an empty list message:

```js
  if (!elements.length) {
    renderPanes(
      renderMapModes() + renderViewSplit(emptyMarkup("Nothing matches this search"), emptyDetailPlaceholder()),
      "",
      { inlineExpand: true },
    );
    bindMapModes();
    return;
  }
```

Populated branch — `listHtml` is the card list only (no `renderMapModes` inside):

```js
  let listHtml = elements.slice(0, 200).map((item) => {
    const selected = expandedId === item.id;
    return `<article class="card${selected ? " selected open" : ""}">` +
      `<button class="card-head" data-expand="${esc(item.id)}">` +
      `<span class="card-title"><strong>${esc(item.name)}</strong><small>${esc(kindLabel(item.kind))}</small></span>` +
      `<span class="chevron">›</span></button></article>`;
  }).join("") + (elements.length > 200 ? `<p class="empty-copy">${elements.length - 200} more — narrow search.</p>` : "");

  const selectedItem = elements.find((e) => e.id === expandedId);
  let detailHtml = "";
  if (selectedItem) {
    detailHtml = `<div class="detail-content">` +
      `<header class="detail-header"><div class="detail-title-wrap"><h1 class="detail-title">${esc(selectedItem.name)}</h1><span class="detail-role">${esc(kindLabel(selectedItem.kind))}</span></div></header>` +
      (claimsBySource.get(selectedItem.id) ?? []).map((claim) => claimRow(claim, byId)).join("") +
      `<small class="evidence">${(selectedItem.evidence ?? []).map((entry) => `${esc(entry.file)}${entry.line ? `:${entry.line}` : ""}`).join(", ") || "no direct evidence"}</small>` +
      `</div>`;
  } else {
    detailHtml = emptyDetailPlaceholder("Select an Element", "Select an element to view its claims and source evidence.");
  }

  renderPanes(
    renderMapModes() + renderViewSplit(listHtml, detailHtml),
    "",
    { inlineExpand: true },
  );
  bindMapModes();
```

- [ ] **Step 4: Run tests**

Run: `node --test test/ui/view-split.test.js test/ui/observed-areas-view.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app.js
git commit -m "$(cat <<'EOF'
feat(ui): side-column detail for Subjects, Capabilities, Everything

EOF
)"
```

---

### Task 5: Wire Changes

**Files:**
- Modify: `src/ui/app.js`

Changes cards are not expandable today; detail is a static summary that was written into the hidden focus layer. The split makes that summary visible beside the list.

- [ ] **Step 1: Wrap Changes in the split**

Replace the `renderPanes(masterHtml, detailHtml)` call in `renderChanges` with:

```js
  const listHtml = masterHtml; // already the heading + change cards
  const detailHtml = `<div class="detail-content">` +
    `<header class="detail-header"><div class="detail-title-wrap"><h1 class="detail-title">Semantic Diff Summary</h1><span class="detail-role">Comparison against baseline checkpoint</span></div></header>` +
    `<p class="reach">Below are the semantic elements and claims modified since the last snapshot.</p>` +
    `</div>`;

  renderPanes(
    renderViewSplit(listHtml, detailHtml),
    "",
    { inlineExpand: true },
  );
```

(If `detailHtml` is already declared above, do not duplicate — only change the `renderPanes` call to use `renderViewSplit` + `inlineExpand: true` and pass `""` as the focus slot.)

- [ ] **Step 2: Full test suite**

Run: `node --test`

Expected: pass, fail 0.

- [ ] **Step 3: Commit**

```bash
git add src/ui/app.js
git commit -m "$(cat <<'EOF'
feat(ui): show Changes summary in a side column

EOF
)"
```

---

### Task 6: Smoke check and confirm focus layer idle

**Files:** none (verification only), unless a bug is found.

- [ ] **Step 1: Grep for remaining focus swaps on map/changes paths**

Run:

```bash
rg -n "renderPanes\(" src/ui/app.js
```

Expected: every Code map / Changes call includes `{ inlineExpand: true }` (or passes a split with that option). Spec and Report already use `inlineExpand: true`. No map/changes call should pass `detailHtml` as the second arg *without* `inlineExpand`.

- [ ] **Step 2: Manual probe (best effort)**

From the worktree:

```bash
node bin/varai.js start /home/gp/dreamLand/jodulabs/varai-slotkeeper-pilot --no-open
```

Open Code map → Areas → click SlotBoard (or the area card). Expected: list + modes stay; detail in the right column; no “Back to List” focus topbar. Repeat for Subjects / Capabilities if data exists. Changes: list + summary side by side.

If the pilot path is missing, note it and rely on the grep + suite.

- [ ] **Step 3: Final suite**

Run: `node --test`

Expected: pass, fail 0.

- [ ] **Step 4: Commit only if Step 2 required a fix; otherwise no commit**

If a fix was needed, commit with a clear message. If not, stop — verification only.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Side column on Code map tabs | Tasks 3–4 |
| Changes included | Task 5 |
| Shared split helper (not per-view copies) | Task 1 |
| `inlineExpand` / no focus activation | Tasks 3–6 |
| Reuse existing detail HTML | Tasks 3–5 (no detail rewriter) |
| Narrow stack | Task 2 media query after base rules |
| Report / Spec unchanged | No Report/Spec tasks |
| Focus DOM may remain | Not deleted |
| Search + modes stay visible | Modes/strip outside split |

No TBD/placeholder steps. Names: `renderViewSplit`, `.view-split`, `.view-split-master`, `.view-split-detail`.
