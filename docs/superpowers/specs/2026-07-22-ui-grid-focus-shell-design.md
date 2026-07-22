# UI Grid → Focus Shell

**Date:** 2026-07-22  
**Status:** Approved for implementation  
**Branch / worktree:** `ui-grid-focus-shell` / `.worktrees/ui-grid-focus-shell`  
**Depends on:** `2026-07-20-observed-areas-readable-outline-design.md`, `2026-07-19-dashboard-system-interface-design.md`, ADR 0003, ADR 0004

## Problem

A structural/look revamp of the dashboard introduced a grid → focus shell
(`bento-grid`, focus layer, master/detail helpers) but left it half-wired and
visually noisy (dark neon default, card-as-data dump). Findings still read as
analyzer inventory rather than a human picture of the system.

North star for this product moment: someone who wants to understand a software
system — especially AI-generated code — should start Varai. First impression
must deliver both a readable system map and honest trust orientation. Core
semantic recovery still needs more work later; this pass does not pretend
otherwise.

## Goal

Finish **Approach 1 — Observed Areas first, stabilize the shell** (UI only):

1. **Map in ~10 seconds** — System → Observed Areas opens as a scannable grid
   of areas with human summary sentences.
2. **Trust on the card** — completeness/coverage is visible before drill-down;
   partial/unknown stay explicit.
3. **Focus as briefing** — opening an area reads as a short system briefing,
   then structured operations → effects → shared parts → evidence.
4. **Shell integrity** — other nav views use a thin compatible master → focus
   so nothing depends on removed DOM (`#elements-list`).

## Non-goals

- Analyzer, System Model, or projection shape changes
- Narrative redesign of Subjects / Capabilities / Changes
- Graph or canvas visualization
- LLM-authored copy
- Invented purpose text beyond existing deterministic templates
- Cleaning unrelated debug scripts left on the shared `main` checkout

## Shell & information architecture

Primary path: **System → Observed Areas** as a two-layer stack.

### Grid layer

- Scannable area cards (plus shared cores / ungrouped sections when present)
- Search remains on this layer
- Change strip remains secondary: shown when a baseline exists; not part of the
  default card face
- Selecting a card swaps to the focus layer (full-view reading), preserving
  search query and scroll intent on return

### Focus layer

- Full reading view for one selected item
- Back control returns to grid with the same view/search state
- Briefing header, then progressive detail (see below)

### Other views

Subjects, Capabilities, Changes, Everything, Unknowns keep a **thin**
master → focus adaptation so the shared shell works. No deep storytelling
pass on those views.

## Grid card content (Observed Areas)

Each area card shows:

| Surface | Source | Rules |
| --- | --- | --- |
| Title | Recovered anchor name | No invented labels |
| Trust chip | Area completeness / coverage from projection | `analyzed` / `partial` / `unsupported` / equivalent — never stronger than the model |
| Summary | `areaSummarySentences` | Up to ~2 lines on the card; full set in focus |
| Meta | Primary operation count | Quiet secondary text |

Whole card activates focus. Status/change badges stay secondary to the summary.

Shared-core and ungrouped rows follow the same master/detail split with compact
labels already defined in `observed-areas-view.js`.

## Focus reading structure

Top → bottom for an observed area:

1. **Briefing** — name, role line (`areaRoleLine`), completeness, full summary
   sentences
2. **Operations** — primary first; each row name + one-line effect/output
   preview (`operationPreviewSummary`)
3. **Expandable operation body** — effects, outputs, outcomes, conditions using
   existing claim vocabulary and human relation labels
4. **Shared parts** — compact core labels
5. **Evidence** — trace steps + on-demand source peek (existing contract)

Empty / weak states:

- No areas: calm empty copy (“scan produced no observed areas yet” / existing
  recovered-none wording)
- Area with no primary effects: keep the card; summary states that explicitly
- Other views: placeholder detail until selection

## Visual language

Scene: reading a repo’s structure in daylight / a bright IDE — calm instrument,
not a neon cave.

- **Default theme: light.** Keep dark toggle; stop treating dark + glow as the
  primary look
- **Restrained palette:** tinted neutrals + existing green/teal accent; remove
  accent glow / high-chroma “radar” treatment on cards
- **Type:** Syne for brand/headings; JetBrains Mono for evidence/paths; keep
  current UI sans for body (no font chase)
- **Grid:** readable cards; uneven bento spans only when useful; borders over
  heavy shadows; no badge pile-ups
- **Focus:** reading measure, clear header hierarchy, labeled sections — not
  nested card stacks
- **Motion:** one grid ↔ focus transition + simple back; nothing decorative

Out of visual scope: illustration, emoji, purple themes, marketing hero.

## Implementation boundaries

Work lives only in `.worktrees/ui-grid-focus-shell` on branch `ui-grid-focus-shell`.

**Touch:**

- `src/ui/index.html` — grid/focus shell markup
- `src/ui/app.js` — `renderPanes`, view renderers, layer swap, search/back
- `src/ui/observed-areas-view.js` — master card + focus briefing markup using
  existing pure helpers
- `src/ui/styles.css` — light default, quiet tokens, grid/focus layout
- `test/ui/observed-areas-view.test.js` — master/detail and card/focus contracts
- Small server/CLI wiring already in the landed WIP only if required for the
  shell to run; no new product semantics

**Preserve:** search, change strip, SSE live model/diff updates, source peek,
deterministic summary templates from the 2026-07-20 readable-outline design.

## Testing

Automated:

- Master HTML vs detail HTML split from `renderObservedAreasOutline`
- Card surface includes trust/completeness + summary sentences
- Focus briefing includes role/summary before operation dump
- Existing helper tests for summaries/dedupe remain green

Manual:

- `node ./bin/varai.js start <repo> --no-open`
- Grid loads after scan; open area → focus; back; search; theme toggle
- Spot-check Subjects/Capabilities/Changes still open without console errors

## Done when

1. System view shows a readable Observed Areas grid once scan data is ready
2. Each area card shows completeness + human summary without opening
3. Focus reads as briefing → structured detail, not a raw claim dump
4. Back / search / live update work; other nav views do not crash
5. UI never claims more than the model (partial/unknown remain visible)

## Relationship to core work

This pass is presentation-only. Better human-level area boundaries and semantic
assembly remain future core work. The UI must make current recovery legible and
honest, not compensate by inventing structure.
