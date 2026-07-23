# Grid-Layer Split for Code Map & Changes

**Date:** 2026-07-23  
**Status:** Draft for review  
**Depends on:** Spec evidence pane (`docs/superpowers/specs/2026-07-23-spec-evidence-pane-design.md`), UI grid → focus shell (`docs/superpowers/specs/2026-07-22-ui-grid-focus-shell-design.md`)  
**Out of scope:** Report accordion, Spec (already split), analyzer / System Model changes, rewriting detail briefing content

## Problem

Code map (Areas, Subjects, Capabilities, Everything) and Changes still use the
focus layer: selecting a card swaps away the grid, hides search and mode tabs,
and shows a full-page detail with a back link. Spec already solved the same
pain with a grid-layer side column. Users expect one interaction model.

## Goal

Selecting an item on Code map or Changes opens the **existing detail** in a
**side column** beside the list. Search, mode tabs, and the card grid stay
visible. No full-page focus swap; no “back to card” chrome for these paths.

## Decisions

| Topic | Choice |
| --- | --- |
| Scope | Code map tabs **and** Changes (retire focus swaps for all list→detail left) |
| Pattern | Same as Spec: grid-layer split, `inlineExpand: true` |
| Shell | Shared split wrapper (generalize Spec’s split), not per-view copies |
| Detail content | Reuse current detail renderers; only change where they mount |
| Report / Spec | Unchanged |

## Information architecture

```text
Code map / Changes (grid layer)
┌─────────────────────┬──────────────────────────┐
│ modes · search ·    │ detail for expandedId    │
│ cards / list        │ (or empty placeholder)   │
│ [selected card] ────┤                          │
└─────────────────────┴──────────────────────────┘
```

Narrow widths: stack detail under the list (same Spec behavior).

## Shell & wiring

1. **Shared split** — Introduce a small grid-layer helper (name TBD in plan,
   e.g. `renderViewSplit(masterHtml, detailHtml)` or CSS class `.view-split`)
   used by Spec (optional migrate), Code map modes, and Changes. Spec may keep
   `.spec-split` as an alias or migrate in the same pass if cheap.
2. **`renderPanes`** — These views pass `{ inlineExpand: true }` and put both
   columns in the master/grid HTML (or master + detail slots rendered into the
   split). Focus layer must not activate when `expandedId` is set.
3. **Selection** — Keep `data-expand` / `expandedId` / Esc / re-click clear.
   Selected card highlighting stays.
4. **Remove for these views** — Focus topbar title, “back to card”, “← OBSERVED
   AREAS” (and equivalents). List context replaces them.

## Views in scope

| View | Master today | Detail today | Change |
| --- | --- | --- | --- |
| Areas | Observed Areas cards | Area briefing HTML | Split beside cards |
| Subjects | Subject/screen cards | Subject/screen detail | Split |
| Capabilities | Capability cards | Capability detail | Split |
| Everything | Element list | Element detail | Split |
| Changes | Change list | Change detail | Split |

## Non-goals

- Redesigning Observed Areas briefing copy or card faces
- Changing Report’s inline accordion
- Removing the focus-layer DOM entirely (may remain unused; delete only if
  nothing else needs it after this pass)
- Seed Studio / Spec authoring

## Success criteria

- Clicking a Code map or Changes item never hides search or mode tabs
- Detail matches today’s focus content for the same `expandedId`
- Esc / re-click clears the pane; placeholder when nothing selected
- Focus layer does not become active for these views
- Report and Spec behavior unchanged
- Narrow layout stacks without a tab/nav switch
