# UI Grid → Focus Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the half-wired dashboard grid → focus shell so Observed Areas delivers a readable system map plus honest trust signals in the first screenful, without changing core analyzers.

**Architecture:** Keep presentation pure in `observed-areas-view.js` (master cards vs focus briefing). `app.js` owns layer swap via `expandedId` + `renderPanes`. CSS makes light the default and quiets neon. No projection/analyzer changes.

**Tech Stack:** Vanilla ESM UI, Node built-in test runner (`node --test`), existing display-language callbacks.

**Spec:** `docs/superpowers/specs/2026-07-22-ui-grid-focus-shell-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `test/ui/observed-areas-view.test.js` | Master/detail split, card trust+summary, no auto-select |
| `src/ui/observed-areas-view.js` | Area/core/ungrouped master cards + focus briefing markup |
| `src/ui/app.js` | Theme default light; `renderPanes` layer swap; Escape→back; thin other views |
| `src/ui/styles.css` | Light default, quiet tokens, grid/focus layout, card/briefing hierarchy |
| `src/ui/index.html` | Shell markup (already present; only fix if tests prove gaps) |
| `bin/varai.js`, `src/server/index.js` | Revert unrelated `stop`/pid WIP (out of scope; `stop.js` missing) |

---

### Task 0: Drop unrelated stop/pid WIP

**Files:**
- Modify: `bin/varai.js`
- Modify: `src/server/index.js`

- [ ] **Step 1: Revert stop command and pid write**

In `bin/varai.js`, remove:

```js
import { stopServer } from "../src/server/stop.js";
```

and the `varai stop` usage line, and the `if (command === "stop") { ... }` block.

In `src/server/index.js`, remove the block that writes `.varai/server.pid`.

- [ ] **Step 2: Confirm no dangling stop import**

Run: `node --check bin/varai.js && node --check src/server/index.js`  
Expected: no syntax errors; `rg "stopServer|server.pid" bin/varai.js src/server/index.js` empty.

- [ ] **Step 3: Commit**

```bash
git add bin/varai.js src/server/index.js
git commit -m "$(cat <<'EOF'
chore: drop unrelated stop/pid WIP from UI shell branch

Keep this branch focused on the grid-focus presentation pass.
EOF
)"
```

---

### Task 1: Tests for grid-first master/detail contract (TDD)

**Files:**
- Modify: `test/ui/observed-areas-view.test.js`

- [ ] **Step 1: Replace the combined `outline renders…` assertions that assume auto-selected detail**

The current test expects summary/detail strings in `populated.html` when `expandedId: null` because render auto-selects the first area. Update that test and add an explicit master/detail test.

Add (or rewrite into) this test:

```js
test("grid master cards show trust and summary without auto-selecting focus", () => {
  const populated = renderObservedAreasOutline({
    projection,
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query: "",
    changesOnly: false,
    changedElements: new Set(),
    changedClaims: new Set(["claim:change"]),
    expandedId: null,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });

  assert.equal(populated.activeId, null);
  assert.match(populated.masterHtml, /Plan Canvas/);
  assert.match(populated.masterHtml, /Mainly changes Building Model/);
  assert.match(populated.masterHtml, /path-status/);
  assert.match(populated.masterHtml, /partial/);
  assert.match(populated.masterHtml, /area-summary/);
  assert.equal(populated.masterHtml.includes("selected"), false);
  assert.equal(populated.masterHtml.includes("detail-content"), false);
  assert.match(populated.detailHtml, /Select an item|Select an observed area/);
  assert.equal(populated.detailHtml.includes("Observed path"), false);
  assert.equal(populated.changedAreaCount, 1);

  const focused = renderObservedAreasOutline({
    projection,
    byId,
    envelopesById,
    pathsById,
    claimsById,
    query: "",
    changesOnly: false,
    changedElements: new Set(),
    changedClaims: new Set(),
    expandedId: projection.areas[0].id,
    relationLabel,
    kindLabel,
    stateMark,
    changeBadge,
    pathStatus,
    claimRow,
    esc,
  });

  assert.equal(focused.activeId, projection.areas[0].id);
  assert.match(focused.masterHtml, /selected/);
  assert.match(focused.detailHtml, /detail-title/);
  assert.match(focused.detailHtml, /Mainly changes Building Model/);
  assert.match(focused.detailHtml, /detail-role/);
  assert.match(focused.detailHtml, /Add wall/);
  assert.match(focused.detailHtml, /changes Building Model/);
  assert.match(focused.detailHtml, /Observed path/);
  assert.match(focused.detailHtml, /Uses shared system parts/);
});
```

Keep existing helper tests (role line, summary sentences, change overlay, empty, changes-only, supporting ops). Adjust the old `outline renders populated…` test so it no longer requires focus markup when `expandedId` is null — either delete it or slim it to empty/changes-only/supporting cases that still apply.

For the supporting-ops case, keep asserting on `supporting.detailHtml` or `supporting.html` with `expandedId` set.

- [ ] **Step 2: Run tests — expect failure on new contract**

Run: `node --test test/ui/observed-areas-view.test.js`  
Expected: FAIL — `activeId` not null when `expandedId` is null, and/or master cards missing `area-summary` / `path-status`.

- [ ] **Step 3: Commit the failing test**

```bash
git add test/ui/observed-areas-view.test.js
git commit -m "$(cat <<'EOF'
test: require grid-first master cards with trust and summary

Lock the Observed Areas contract so focus is opt-in via expandedId.
EOF
)"
```

---

### Task 2: Implement grid cards + no auto-select

**Files:**
- Modify: `src/ui/observed-areas-view.js`

- [ ] **Step 1: Stop auto-selecting the first item**

In `renderObservedAreasOutline`, replace:

```js
const activeId = expandedId || areas[0]?.id || cores[0]?.id || ungrouped[0]?.envelopeId || null;
```

with:

```js
const activeId = expandedId || null;
```

When nothing is selected, keep the existing detail placeholder (do not render `renderAreaDetail` for a default area).

- [ ] **Step 2: Put trust + summary on master area cards**

Update `renderArea` so the card face includes completeness and up to two summary sentences:

```js
function renderArea(area, ctx) {
  const {
    byId, claimsById, activeId, changedElements, changedClaims,
    relationLabel, kindLabel, changeBadge, pathStatus, esc,
  } = ctx;
  const anchor = byId.get(area.anchorElementId);
  const open = activeId === area.id;
  const changed = areaIsChanged(area, changedElements, changedClaims);
  const role = areaRoleLine(area, byId, kindLabel);
  const summaryLines = areaSummarySentences(area, claimsById, byId, relationLabel).slice(0, 2);
  const summary = summaryLines
    .map((line) => `<p class="area-summary">${esc(line)}</p>`)
    .join("");

  return `<article class="area-card${open ? " open selected" : ""}${changed ? " area-changed" : ""}">` +
    `<button class="area-head" data-expand="${esc(area.id)}" aria-expanded="${open}">` +
    `<span class="area-title-row">` +
    `<span class="area-title"><strong>${esc(anchor?.name ?? area.anchorElementId)}</strong>` +
    `<small class="area-role">${esc(role)}</small></span>` +
    `${pathStatus(area.completeness)}` +
    `${changed ? changeBadge() : ""}` +
    `</span>` +
    `<span class="area-card-body">${summary}</span>` +
    `<span class="chevron">›</span></button>` +
    `</article>`;
}
```

Also switch `renderSharedCore` / `renderUngrouped` article class from `area-block` to `area-card` (keep `core-block` modifier) so one grid style applies. Do not invent summaries for cores/ungrouped beyond existing small role text.

- [ ] **Step 3: Enrich focus briefing slightly**

In `renderAreaDetail`, keep the existing header + full summary sentences. Before listing full operation sections, add a compact operations list with previews (primary first):

```js
  const ops = (primary.length ? primary : area.operations);
  const opIndex = ops.map((operation) => {
    const envelope = envelopesById.get(operation.envelopeId);
    const preview = operationPreviewSummary(operation, claimsById, byId, relationLabel);
    return `<li class="op-preview-row">` +
      `<strong>${esc(envelope?.name ?? operation.envelopeId)}</strong>` +
      `<span class="op-preview">${esc(preview)}</span></li>`;
  }).join("");
```

Insert after summary:

```js
    `<section class="ops-preview"><h2 class="group-heading">Operations</h2><ul class="op-preview-list">${opIndex}</ul></section>` +
```

Then keep the existing full `primaryHtml` / `supportingHtml` / shared parts blocks below (or fold previews only and keep full sections — do not drop evidence/paths).

- [ ] **Step 4: Run tests**

Run: `node --test test/ui/observed-areas-view.test.js`  
Expected: PASS for all Observed Areas UI tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/observed-areas-view.js test/ui/observed-areas-view.test.js
git commit -m "$(cat <<'EOF'
feat: show Observed Areas as grid cards with opt-in focus

Surface trust and summary on the card face; open focus only when selected.
EOF
)"
```

---

### Task 3: Shell behavior in `app.js` (light default, back, Escape)

**Files:**
- Modify: `src/ui/app.js`
- Modify: `src/ui/index.html` (only if IDs/classes missing)

- [ ] **Step 1: Default theme to light**

Change:

```js
document.documentElement.dataset.theme = localStorage.getItem("varai-theme") || "dark";
```

to:

```js
document.documentElement.dataset.theme = localStorage.getItem("varai-theme") || "light";
```

- [ ] **Step 2: Confirm `renderPanes` swaps on `expandedId` only**

Keep:

```js
function renderPanes(masterHtml, detailHtml) {
  if (el.bentoGrid) el.bentoGrid.innerHTML = masterHtml;
  if (el.focusContent) el.focusContent.innerHTML = detailHtml || emptyDetailPlaceholder();

  if (expandedId) {
    el.gridLayer?.classList.remove("active");
    el.focusLayer?.classList.add("active");
  } else {
    el.focusLayer?.classList.remove("active");
    el.gridLayer?.classList.add("active");
  }

  bindExpanders();
  bindSnippets();
}
```

Ensure back button clears `expandedId` (already present). When switching nav views, `expandedId = null` (already present in nav click handler).

- [ ] **Step 3: Escape returns from focus**

In the existing `keydown` handler, after the search Escape branch, add:

```js
  } else if (event.key === "Escape" && expandedId) {
    expandedId = null;
    render();
  }
```

- [ ] **Step 4: Smoke-check other views still call `renderPanes`**

No API change required if Subjects/Capabilities/Changes/Everything/Unknowns already use `renderPanes`. Manually skim that none still reference `el.list` / `#elements-list`.

Run: `rg "el\\.list|elements-list" src/ui/app.js src/ui/index.html`  
Expected: no `el.list`; `elements-list` absent from HTML (CSS leftovers cleaned in Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/ui/app.js src/ui/index.html
git commit -m "$(cat <<'EOF'
fix: default dashboard to light and Escape-back from focus

Align shell behavior with the grid-first reading flow.
EOF
)"
```

---

### Task 4: Visual language — light default, quiet CSS, card/focus layout

**Files:**
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Make light tokens the `:root` default**

Restructure so `:root` (and `[data-theme="light"]`) use the current light palette. Move the dark neon palette under `[data-theme="dark"]` only.

Remove or neutralize glow usage:

- Delete / stop using `--accent-glow` on brand icon `filter`, nav active `box-shadow`, and focus rings; prefer `outline` / quiet border.

- [ ] **Step 2: Style `.bento-grid` + `.area-card` as readable cards**

Target rules (adapt to file; keep CSS variables):

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  padding: 8px 4px 32px;
  align-content: start;
}

.area-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin: 0;
}

.area-card .area-head {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: inherit;
}

.area-card .area-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.area-card .area-summary {
  margin: 0;
  color: var(--text-mid);
  font-size: 13px;
  line-height: 1.45;
}

.area-card.selected {
  border-color: var(--accent-border);
  background: var(--bg-active);
}

.view-layer { display: none; }
.view-layer.active { display: block; }
.focus-layer.active { display: flex; flex-direction: column; min-height: 0; }
.focus-content { overflow: auto; padding: 8px 4px 40px; max-width: 52rem; }
```

Ensure `.group-heading` spans full grid width:

```css
.bento-grid > .group-heading,
.bento-grid > .change-strip,
.bento-grid > .baseline-note,
.bento-grid > .empty-copy,
.bento-grid > .empty-state {
  grid-column: 1 / -1;
}
```

- [ ] **Step 3: Focus briefing hierarchy**

```css
.detail-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.detail-title { font-family: Syne, sans-serif; font-size: 1.6rem; margin: 0; color: var(--text-bright); }
.detail-role { color: var(--text-dim); font-size: 13px; }
.ops-preview { margin: 16px 0; }
.op-preview-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.op-preview-row { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.op-preview { color: var(--text-mid); font-size: 13px; }
```

Avoid nested heavy card stacks inside focus; section headings + borders only.

- [ ] **Step 4: Remove dead `.elements-list` rules or retarget scrollbars to `.bento-grid` / `.focus-content`**

Replace scrollbar selectors that mention `.elements-list` with `.bento-grid, .focus-content`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/styles.css
git commit -m "$(cat <<'EOF'
style: light-first grid and focus reading layout

Quiet neon treatment and make Observed Areas cards scannable.
EOF
)"
```

---

### Task 5: Verification

**Files:** none required beyond fixes if verification fails

- [ ] **Step 1: Run UI unit tests**

Run: `node --test test/ui/observed-areas-view.test.js`  
Expected: all PASS.

- [ ] **Step 2: Run full test suite (or at least UI + related)**

Run: `npm test`  
Expected: PASS (or only pre-existing failures unrelated to this branch — if any fail because of this UI change, fix before claiming done).

- [ ] **Step 3: Manual dashboard smoke**

From the worktree:

```bash
node ./bin/varai.js start . --no-open --port 3848
```

Open the printed URL. Check:

1. Light theme by default  
2. System view shows area **cards** with summary + completeness  
3. Click area → focus briefing with operations; Back and Escape return to grid  
4. Search filters cards; clearing search restores list  
5. Subjects / Capabilities open without blank/crash  
6. Theme toggle still switches dark/light  

Stop the server when done (Ctrl+C).

- [ ] **Step 4: Final commit only if smoke forced fixes**

If fixes were needed, commit them with a focused message. Otherwise no empty commit.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Grid → focus shell for Observed Areas | 2, 3, 4 |
| Card: name + completeness + summary | 1, 2 |
| Focus briefing then structured detail | 2, 4 |
| Thin master/focus for other views | 3 |
| Light default, quiet visuals | 3, 4 |
| Preserve search / change strip / SSE / peek | 3 (no regressions), 5 |
| UI-only; no core lifts | all |
| Drop unrelated stop WIP | 0 |
| Tests for master/detail + card surface | 1, 2, 5 |

## Self-review notes

- No analyzer/projection tasks (YAGNI per spec).
- Auto-select removal is explicit — fixes the broken “always in focus” feel.
- `stop.js` not required; Task 0 prevents a broken `varai stop` import on this branch.
