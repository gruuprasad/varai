# Observed Areas Readable Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Observed Areas readable via a progressive stack (name → role → templated sentence → details) built only from recovered facts.

**Architecture:** Pure presentation helpers in `src/ui/observed-areas-view.js` compose role lines, deduped summary sentences, and ordered operation sections. CSS clarifies hierarchy. Projection prominence work already in the branch stays; no analyzer or kernel changes for copy invention.

**Tech Stack:** Vanilla ESM UI, Node test runner, existing display-language labels via UI callbacks.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/ui/observed-areas-view.js` | Templates, dedupe, outline HTML |
| `src/ui/styles.css` | Role/summary/detail hierarchy |
| `test/ui/observed-areas-view.test.js` | Template and render assertions |
| `src/system-model/projections/observed-areas.js` | Already adds prominence (keep; land with branch) |
| `test/system-model/observed-areas.test.js` | Already covers prominence (keep) |

---

### Task 1: Summary / role helpers (TDD)

**Files:**
- Modify: `src/ui/observed-areas-view.js`
- Test: `test/ui/observed-areas-view.test.js`

- [ ] **Step 1: Write failing tests for helpers**

Add:

```js
test("role line uses kind label, primary counts, and completeness", () => {
  assert.equal(
    areaRoleLine(projection.areas[0], kindLabel),
    "surface · 1 primary operation · supported",
  );
  assert.equal(
    areaRoleLine(projection.areas[1], kindLabel),
    "surface · 1 primary operation · partial",
  );
});

test("summary sentences dedupe relation+target and lead with Mainly", () => {
  const lines = areaSummarySentences(projection.areas[0], claimsById, byId, relationLabel);
  assert.deepEqual(lines, ["Mainly changes Building Model."]);
  const dupOp = {
    ...projection.areas[0].operations[0],
    primaryEffectClaimIds: ["claim:change", "claim:change"],
  };
  const dupArea = { ...projection.areas[0], operations: [dupOp, dupOp] };
  assert.deepEqual(
    areaSummarySentences(dupArea, claimsById, byId, relationLabel),
    ["Mainly changes Building Model."],
  );
});

test("operation preview summary uses one deduped primary claim", () => {
  assert.equal(
    operationPreviewSummary(projection.areas[0].operations[0], claimsById, byId, relationLabel),
    "changes Building Model",
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ui/observed-areas-view.test.js`  
Expected: FAIL — helpers not exported / not defined.

- [ ] **Step 3: Implement helpers**

```js
export function areaRoleLine(area, kindLabel) {
  const kind = kindLabel(/* anchor kind from caller or pass kind string */);
}

export function areaSummarySentences(area, claimsById, byId, relationLabel) { /* ... */ }
export function operationPreviewSummary(operation, claimsById, byId, relationLabel) { /* ... */ }
export function dedupeClaimsBySummary(claims, byId, relationLabel) { /* ... */ }
```

Rules:
- Prefer operations with `prominence === "primary"`; if none, use all.
- Collect `primaryEffectClaimIds` then `outputClaimIds`.
- Dedupe key = `${relation}\0${targetKey}` where targetKey is element id or literal value.
- Group by relation; most frequent relation (stable tie-break by relation name) → `Mainly ${summaries joined with " · "}.`
- Remaining claims → `Also ${...}.`
- Empty → `["No primary effect or output recovered."]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/ui/observed-areas-view.test.js`  
Expected: PASS for new helper tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/observed-areas-view.js test/ui/observed-areas-view.test.js
git commit -m "$(cat <<'EOF'
feat: add templated role and summary helpers for observed areas

EOF
)"
```

---

### Task 2: Landing + detail render

**Files:**
- Modify: `src/ui/observed-areas-view.js`
- Modify: `src/ui/styles.css`
- Test: `test/ui/observed-areas-view.test.js`

- [ ] **Step 1: Write failing render assertions**

```js
test("collapsed area shows role line, Mainly sentence, and single op effect", () => {
  const populated = renderObservedAreasOutline({ /* ... expandedId: null */ });
  assert.match(populated.html, /area-role/);
  assert.match(populated.html, /Mainly changes Building Model/);
  assert.equal(populated.html.includes("changes Building Model · changes Building Model"), false);
});

test("open area uses Changes-first sections and collapses supporting", () => {
  const expanded = renderObservedAreasOutline({ /* expandedId: area with supporting op */ });
  assert.match(expanded.html, /<details class="supporting-observations"/);
  // Section headings appear in order Changes before When when both present
});
```

- [ ] **Step 2: Run to verify fail / update render**

Update `renderArea`:
- Put role text in `<small class="area-role">` via `areaRoleLine`.
- Add `<p class="area-summary">` lines from `areaSummarySentences`.
- Preview uses `operationPreviewSummary` once.
- Open detail: reorder sections to Changes, Uses, Produces, When, May result, Unresolved; dedupe claim rows in each section.
- Wrap supporting ops in `<details class="supporting-observations" …>` when primary ops exist (open when only supporting).

Update CSS for `.area-role`, `.area-summary`, `.supporting-observations`, quieter `.path-status` if needed.

- [ ] **Step 3: Run UI tests**

Run: `node --test test/ui/observed-areas-view.test.js`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/observed-areas-view.js src/ui/styles.css test/ui/observed-areas-view.test.js
git commit -m "$(cat <<'EOF'
feat: render readable observed-area landing and detail stories

EOF
)"
```

---

### Task 3: Land prominence projection WIP + verify

**Files:**
- Modify (already dirty): `src/system-model/projections/observed-areas.js`
- Modify (already dirty): `test/system-model/observed-areas.test.js`
- Modify (already dirty): `src/ui/app.js` if needed for paths wiring

- [ ] **Step 1: Ensure projection + UI tests pass together**

Run: `node --test test/ui/observed-areas-view.test.js test/system-model/observed-areas.test.js`  
Expected: PASS.

- [ ] **Step 2: Run full suite**

Run: `npm test`  
Expected: PASS.

- [ ] **Step 3: Commit remaining WIP with presentation**

```bash
git add src/system-model/projections/observed-areas.js test/system-model/observed-areas.test.js src/ui/app.js
git commit -m "$(cat <<'EOF'
feat: rank observed-area operations by primary semantic reach

EOF
)"
```

---

### Task 4: Spec + plan docs commit

- [ ] **Step 1: Commit design and plan**

```bash
git add docs/superpowers/specs/2026-07-20-observed-areas-readable-outline-design.md \
  docs/superpowers/plans/2026-07-20-observed-areas-readable-outline.md
git commit -m "$(cat <<'EOF'
docs: specify readable observed-areas outline presentation

EOF
)"
```

(Order may be first commit if preferred; keep docs on the branch.)
