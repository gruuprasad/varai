# Varai Presentation — The System Interface

**Date:** 2026-07-19
**Status:** Draft for review
**Depends on:** `2026-07-19-anchor-based-lift-design.md` (implemented in `87fc641`), ADR 0003, ADR 0004, `docs/semantic-language.md`

## Problem

The anchor-based lift works. A live scan of Kalakar recovers the domain skeleton a developer
actually holds in their head: `BuildingModelDocument` (29 behaviors), `Project` (14),
`ProjectArtifact` (14), `User` (7), `RenderJob` (5). The model is right.

The presentation throws that away:

- The dashboard flattens all 313 browse-by-thing roots into one list and ignores the `tier`
  field the projection already computes. 200 of those roots are tier-2 boundary contracts and
  232 have zero recovered behaviors.
- Tier 0 itself is too wide for a landing view: 92 roots, of which 63 are small `surface`
  elements (panels, chips, toolbars) that are parts *of* screens, shown as peers of `Project`.
- Primary text is 12px monospace. Internal vocabulary (`claims`, `elements`, `inferred`,
  `coverage`, `aggregate`) dominates every view. Everything has equal visual weight.
- The first screen answers "what did the analyzer emit," not "what is this system" or
  "what changed."

The CLI report has the same disease: `varai map` renders the same flat root list and truncates
it at an arbitrary 24.

## What the dashboard is

An **interface into the system, not a report about it**. A developer opens it in three moments:

1. **"What did the agent just do?"** — the daily supervision loop (ADR 0003). Change at the
   semantic level: subjects, behaviors, contracts — not file diffs.
2. **"How does X work?"** — targeted descent from a subject or capability down to actual code.
3. **"What is this system?"** — first open, onboarding, explaining the system to someone.

Home is the **subject map with change surfaced loudly on it**. A change-only home would be
empty on first scan and between sessions; the map is always meaningful, and a map that shows
what moved *is* the supervision instrument. Those are one view, not two.

Settled presentation decisions:

- **Structured outline**, not a spatial node-and-edge canvas. Ranked, expandable, progressive
  disclosure. Fits the vanilla-JS no-build stack and the tier data that already exists.
- **Keep the visual identity** (dark theme, teal accent, brand). Fix hierarchy, typography,
  and language — not the palette.
- **Code is the floor of every drill-down.** Every behavior path ends in actual source,
  viewable inline, never the landing view.
- **Honesty stays local.** Exhaustive claim/coverage tables move to an advanced layer, but
  `ambiguous`/`unverified` marks stay attached to the specific behavior they affect. Varai
  must not hide its own uncertainty to look cleaner.

## Module map and layering contract

Varai is CLI-first, like git. The frontend is a client of varai, not a module of it.

```text
┌─ optional clients ────────────────────────────────┐
│  src/ui/          dashboard (static JS/CSS/HTML)  │  a CLIENT of varai
│  (future: IDE shell, TUI, worktree selector)      │
└──────────────┬────────────────────────────────────┘
               │ JSON contract only:
               │ /api/model /api/diff /api/events /api/source
┌─ adapter ────▼────────────────────────────────────┐
│  src/server/      HTTP + SSE + file watcher       │  no model logic
└──────────────┬────────────────────────────────────┘
               │ core public functions
┌─ core (the product; CLI-complete) ────────────────┐
│  bin/varai.js       porcelain: map, snapshot,     │
│                     diff, log, start              │
│  src/reporters/     deterministic text rendering  │
│                     and display vocabulary        │
│  src/system-model/  kernel: model, identity,      │
│                     validate, diff, projections   │
│  src/snapshots/     content-addressed store,      │
│                     worktree-aware                │
│  src/scanners/      analyzers + lift (private)    │
└───────────────────────────────────────────────────┘
```

Core itself splits along a second axis (ADR 0004's central decision, already implemented):
`src/scanners/` is the only place framework knowledge may live — extractors
(`fastapi.js`, `react-vite.js`, `sqlalchemy.js`, …) produce framework-shaped private
observations, and `src/scanners/lift/` converts them into framework-neutral Elements and
Claims. `src/system-model/`, `src/snapshots/`, and `src/reporters/` never contain a
framework-specific term. Supporting a new framework means adding an extractor, never
touching the kernel. The screen⊃surface work in this spec follows the same rule: the
render-chain resolution is React-specific and lives in the scanner side; what it emits is
a neutral `contains` claim.

Two rules, enforced by this design:

1. **Dependency direction is strictly downward.** Core never imports from `src/server/` or
   `src/ui/`. The server serializes what core computes; it derives nothing. The UI renders
   what the API serves; it derives nothing. Today `src/ui/app.js` duplicates the relation-label
   vocabulary owned by `src/reporters/` — this design collapses that duplication: core owns
   one display vocabulary, the server includes it in the model payload, the UI consumes it.
2. **CLI-completeness.** Every semantic fact the dashboard can show must be derivable from
   `varai map` / `varai diff` output. The frontend adds interaction (expand, badges, inline
   code peek), never information.

The git analogy is exact: `src/system-model/` + `src/snapshots/` are plumbing,
`bin/varai.js` + `src/reporters/` are porcelain, the dashboard is gitk — deletable without
losing any capability. This contract is what makes future clients (IDE extension, worktree
selector shell) additive rather than rearchitecture.

## The three altitudes

### Altitude 1 — System (home)

- **Header** in plain language: system name plus a sentence-shaped summary
  ("19 subjects · 11 screens · 444 observed behaviors"). File/element/claim counts leave the
  topbar for the advanced layer.
- **Change strip** (only when a snapshot baseline exists and the diff is non-empty):
  "N subjects changed since \<baseline\>." Activating it filters the map to changed entries.
- **Subjects**: Resource elements of kind `aggregate` and `entity`, ranked by distinct
  behavior count. The ranking lives in the projection so the dashboard and `varai map`
  render the same order without client-side re-sorting; tier remains available for the
  advanced layer. Each row: name, plain-language kind ("in-memory model" / "stored record"),
  behavior count, change badge if it moved since baseline, an honesty mark only when
  unresolved analysis touches it. Kalakar today: 19 rows, `BuildingModelDocument` first.
- **Screens**: the 11 `screen` elements as a second group, each expandable to its nested
  surfaces (see grouping below). Surfaces never appear at top level.
- **Not on home**: the 200 boundary contracts, frontend `state` stores, and zero-behavior
  roots. All remain reachable through search and the advanced "Everything" view.

Target scale on Kalakar: ≈30 top-level entries instead of 313.

### Altitude 2 — Subject (or screen)

Opening a subject shows:

- Its behaviors, each rendered as a deterministic sentence composed from existing claims:
  *"Add wall — reached through Plan Workspace → `POST /api/walls` — changes
  BuildingModelDocument."* Distinct actions stay distinct (behavior identity comes from the
  lift; presentation never merges).
- Claim-state marks inline on the affected behavior, in plain words: "not verified,"
  "two candidates matched." Never a global footnote, never hidden.
- When the subject changed since baseline: changed behaviors highlighted, with what changed
  (added/removed/modified contract, effect, or reach) stated in the same sentence vocabulary.

Opening a screen shows its surfaces and the behaviors they offer, same treatment.

### Altitude 3 — Behavior (implementation)

- The ordered `implementationPath` for each claim, as today, plus: each step expands to an
  **inline read-only source snippet** (±10 lines around the evidence line) served by the new
  `/api/source` endpoint. A jump-to-editor link accompanies each step.
- This is where "peek into actual code" is fulfilled. The CLI equivalent is the `file:line`
  evidence already printed by `varai map`; the snippet is frontend convenience, not
  frontend-only information.

## Change as a dimension, not a page

The current Progression view is a flat list of change cards labeled by internal IDs. Instead:

- Change badges on home (per subject/screen), the change strip as filter, and per-subject
  change detail at altitude 2 — all reading the diff that `varai diff` already computes
  against the snapshot baseline. No new core diff work.
- The flat chronological change list survives as a secondary view for "show me everything
  that moved," relabeled in display vocabulary rather than raw IDs.

## Core changes

### 1. Screen ⊃ surface containment (analyzer + projection)

Verified against the live model: **no structural claim links surfaces to screens today** —
both are exposed flat by the UI subsystem. Grouping therefore needs a small analyzer
addition, not projection sorting:

- Emit `contains` claims (existing kernel vocabulary — no new relations) from screen elements
  to surface elements when the frontend component import/render chain resolves the surface's
  defining component into the screen's component tree. The implementation graph and frontend
  interaction resolution built for the lift already walk these chains.
- Resolution is deterministic: resolved chain → `observed` claim; a surface rendered by
  multiple screens gets a `contains` claim from each; an unresolvable surface stays ungrouped
  and is listed under an honest "not placed on a screen" group at the end of the screens
  section, with a projection diagnostic. Never guess from names or file paths.
- `browseByThing` consumes these claims to emit nested screen roots
  (`surfaceIds` under screen roots) and to exclude contained surfaces from the top level.

### 2. Display vocabulary owned by core

- One module (in `src/reporters/`) owns: relation labels (already exists there), plain-language
  claim-state phrasing, and plain-language kind phrasing (`aggregate` → "in-memory model",
  `entity` → "stored record", `contract` → "data contract", `state` → "UI state",
  `surface` → "panel", `screen` → "screen").
- The markdown reporter and the server's model payload both use it. `app.js` deletes its
  duplicated tables.

### 3. Reporter parity

- `varai map` markdown adopts the same structure: subjects ranked, screens with nested
  surfaces, contracts and zero-behavior roots summarized in one line with a pointer to
  structured output, coverage in plain language. The arbitrary 24-root truncation is replaced
  by the same subject/screen grouping the dashboard shows.

## Server changes

- **`GET /api/source?file=<repo-relative>&line=<n>`** → `{ file, startLine, lines: [...] }`,
  ±10 lines, text only. Path must resolve inside the scanned repo root (reject traversal and
  symlinks escaping the root); read-only; no write endpoints of any kind.
- Model payload gains the display vocabulary block from core. No other server logic.

## Frontend changes

- Information architecture per the three altitudes; tier/kind-aware grouping replaces the
  flat list; "show all 313" disappears in favor of search plus the advanced view.
- Typography: primary reading text 15–16px in the UI font; monospace reserved for paths,
  symbols, and code snippets. Line length capped for readability.
- Language: the words "element," "claim," "coverage," "lens," "subsystem," and claim-state
  jargon never appear in primary views; coverage becomes "what varai couldn't determine."
  All labels come from the core vocabulary block.
- Advanced layer: the "Everything" view (all elements, raw claims, evidence), the full
  coverage table, and the chronological change list — searchable, explicitly secondary.
- Keep: SSE live updates, theme toggle, keyboard/focus behavior, reduced-motion handling,
  small-screen layout.

## Out of scope

- Worktree-selector UI / IDE shell (future client; the layering contract keeps it additive).
- Spatial/graph visualization of the system.
- LLM narration or any non-deterministic summarization (ADR 0004 unchanged).
- Desktop (Electron/Neutralino) packaging.
- New kernel vocabulary, relations, or model schema changes beyond the `contains` claims,
  which use existing vocabulary.

## Acceptance

On the Kalakar scan:

1. Home shows ≈30 top-level entries (subjects + screens), `BuildingModelDocument` ranked
   first — not 313 rows.
2. Opening `BuildingModelDocument` shows its distinct behaviors as plain sentences with
   reach; add/delete/import-style actions remain separate entries.
3. A majority of the 63 surfaces nest under their screens via `observed` `contains` claims;
   the remainder appear under "not placed on a screen," never silently dropped or guessed.
4. A behavior drill-down reaches actual source lines inline through `/api/source`, and the
   same path is printed as `file:line` evidence by `varai map`.
5. After a change to a public contract and a new snapshot baseline, the owning subject shows
   a change badge on home and the changed behavior is highlighted at altitude 2.
6. `varai map` markdown presents the same subjects-first, screens-nested structure — no
   dashboard-only semantics.
7. No file in `src/system-model/`, `src/snapshots/`, `src/scanners/`, or `src/reporters/`
   imports from `src/server/` or `src/ui/`; relation/kind/state display labels are defined
   in exactly one core module.
8. Primary views use ≥15px UI-font text; monospace appears only on paths, symbols, and
   code; internal jargon is absent from primary views.
