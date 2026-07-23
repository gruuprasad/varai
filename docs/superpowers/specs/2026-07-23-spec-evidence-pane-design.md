# Spec Evidence Pane — Stay on Spec When Reading Why

**Date:** 2026-07-23  
**Status:** Draft for review  
**Depends on:** Spec page redesign (`docs/superpowers/plans/2026-07-23-spec-page-redesign.md`), Report evidence card (`src/ui/report-view.js`), ADR 0005  
**Follow-on (out of scope):** Seed Studio / chat → seed drafting

## Problem

The Spec page is the approved intent document: concepts, requirements, live
verdict chips. Clicking a requirement currently runs `data-goto`, switches the
sidebar to Report, and expands that card in Report’s verdict-bucket list.

That handoff is correct as a *link to the overview*, but wrong as the default
for “why did this row score this way?” The user loses Spec’s concept grouping
and the Spec nav selection for a subtle tab change. The pain is context theft,
not the evidence card itself.

## Goal

On Spec, opening a requirement shows the **same evidence card Report uses**, in
a **split pane beside (or under) the document**, while Spec stays selected.
Report remains the verdict-first home. An explicit “See the report →” still
crosses over when the user wants the overview.

## Non-goals

- Seed Studio / assistant chat / proposal import redesign (deferred; next design)
- Changing Report’s layout, bucket ordering, or inline-expand behavior
- Analyzer, seed schema, reconciliation, or System Model changes
- New verdict vocabulary (reuse existing display-language labels)
- Focus-layer full-view swap for Spec (rejected: too much movement)

## Decisions

| Topic | Choice |
| --- | --- |
| Priority vs Seed Studio | Fix Spec ↔ Report reading flow first |
| Where evidence opens | Split pane on Spec (Approach 1) |
| Card content | Same card as Report (`renderRowDetail`) |
| Report after this | Unchanged — still verdict-first home |
| Default row click | Stays on Spec; does not switch nav |
| Explicit Report link | Header “See the report →” (and carries open id when set) |

## Information architecture

- **Spec** — “what did I ask for” (document by concept) + optional evidence pane
- **Report** — “how are we doing?” (buckets by verdict) + inline expand (today)
- One evidence explanation, two doors. Spec does not invent a second truth UI.

```text
Spec document (concepts)     Evidence pane
─────────────────────────    ──────────────────────────
Book Slot                    [same renderRowDetail card]
  accepts BookingRequest ──► You asked / Builder / varai found
  creates Booking              + reading order
  …
See the report → ──────────► Report view (± that card expanded)
```

## Layout

### Wide

Two columns inside the **grid layer** (not the focus layer):

1. **Document column** — existing Spec header, sections, notes, collapsed composer
2. **Evidence column** — placeholder, or the shared requirement detail for `expandedId`

Selected requirement row stays visually highlighted in the document.

### Narrow

Stack: document on top, evidence panel full-width under it (same card). Still no
tab switch.

### Shell wiring

Spec keeps `inlineExpand: true` so the grid layer stays active. The split is a
`.spec-split` structure rendered into the bento grid — the same “detail lives
in the grid, not the focus layer” pattern Report already uses for inline expand.

## Interaction

| Action | Result |
| --- | --- |
| Click a requirement | Set `expandedId`; fill evidence pane with that card |
| Click another requirement | Swap pane; previous row deselects |
| Click selected row again, Esc, or ✕ | Clear `expandedId`; pane shows placeholder |
| Search filters out the open row | Clear selection and pane |
| “See the report →” | `activeView = review`; keep `expandedId` if one is open |
| No spec / draft under review | No evidence pane (nothing reconciled yet) |
| Requirement with no verdict yet | Pane still opens; card shows honest empty/unknown evidence |

Placeholder copy when nothing is selected: pick a requirement to see why varai
scored it. Do not duplicate the Spec header in the pane.

## Components & wiring

1. **Shared evidence** — Export `renderRowDetail(card)` (already in
   `report-view.js`) and a small `findCard(review, id)` so Spec and Report call
   the same renderer. One DOM shape, one CSS (`.req-detail` / truth columns).
2. **Spec rows** — Change `data-goto` → `data-expand` so `bindExpanders` owns
   selection. Remove the row-click path that sets `activeView` to Report.
3. **Header link** — Keep `data-goto-report`: switch to Report; if `expandedId`
   is set, land with that card expanded (Report’s existing inline expand).
4. **`renderIntent` (approved state)** — Build `.spec-split` with document HTML +
   evidence HTML (placeholder or `renderRowDetail(findCard(...))`).

## Error / empty honesty

- Missing review / still scanning: pane says the check is not ready — no invented
  evidence.
- Unbound / couldn’t tell / missing: use the same card Report would show for
  that verdict. Spec must not soften or re-decide.

## Testing

Thin, high-signal only:

- Spec requirement markup uses `data-expand`, not `data-goto`
- `findCard` returns the matching review card by commitment id
- Shared detail still renders the three truth columns for a fixture card

CSS and click wiring are verified by looking at the page on the pilot.

## Follow-on (not this design)

**Seed Studio** — chat / assistant turns prose into a seed proposal; human
reviews meaning and approves. Display language: *spec* (seed on disk),
*requirement* (commitment), *approved* (ratified). That authoring surface is a
separate brainstorm after this reading-flow fix lands.

## Success criteria

- Clicking a Spec requirement never changes the sidebar selection away from Spec
- The open evidence matches Report’s card for the same requirement id
- “See the report →” still reaches the verdict-first overview
- Report behavior unchanged when browsing Report directly
