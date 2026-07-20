# Observed Areas Readable Outline

**Date:** 2026-07-20  
**Status:** Approved for implementation  
**Depends on:** `2026-07-20-observed-areas-visualization.md`, `2026-07-19-dashboard-system-interface-design.md`

## Problem

The Observed Areas landing view shows recovered identifiers
(`PlanCanvasLayer`, `BuildingModelDocument`) and status chips (`PARTIAL`,
`changed`) without answering “what is that?” in system language. Effect lines
repeat the same claim (`changes X · changes X`). Shared-core chips dump long
type concatenations. Open detail is a claim dump rather than an operation story.

Code names may stay. The missing layer is a progressive stack of meaning built
only from recovered facts.

## Goal

Make Observed Areas readable as a system interface:

1. Collapsed area → name, role, one templated sentence, short op preview.
2. Open area → ordered operation stories with paths and evidence on demand.
3. Shared parts stay separate, compact, and linkable — never merge parents.

Honesty stays strict: templates from recovered kind labels, counts, claims, and
shared-core anchors only. No invented purpose copy, glossary, or domain names.

## Approach

Templated outline polish (no two-pane layout, no node graph).

### Landing row (collapsed)

```text
PlanCanvasLayer
  panel · 7 primary operations · partial

  Mainly changes BuildingModelDocument.

  Trim on canvas ………… changes BuildingModelDocument
  Create on canvas ……… changes BuildingModelDocument
  …
  Uses shared parts: BuildingModelDocument · ShellTopologyResult (+12)
```

Rules:

- **Title** = recovered anchor name.
- **Role line** = display kind label · primary/observed counts · completeness.
- **Summary sentence(s)** = deterministic template over primary operations’
  primary effects and outputs, **deduped by relation+target**. Lead with
  `Mainly …`. Additional distinct relations/outputs use `Also …`. If none:
  `No primary effect or output recovered.`
- **Op preview** ≤4 lines; one primary effect/output summary each (deduped).
- **Shared parts** compact: first anchors via existing compact core label;
  full list only when the core is opened.
- Status badges remain secondary to the sentence.

### Open detail

```text
PRIMARY OPERATIONS

Trim on canvas · partial
  Changes  BuildingModelDocument
  Uses     …
  Path     … → evidence

SUPPORTING OBSERVATIONS  (collapsed by default when primary ops exist)
  …

SHARED SYSTEM PARTS
  …
```

Section order inside an operation, omitting empties:

1. Changes  
2. Uses  
3. Produces  
4. When  
5. May result  
6. Unresolved  

Duplicate claim summaries inside a section collapse to one row. Observed path
stays a compact step list; existing claim/snippet expanders remain the evidence
floor.

### Shared parts + change overlay

- Landing/core titles use compact labels; open state shows full anchors.
- Subline: `shared system part · used by N`.
- Used-by jump links unchanged.
- Change badges and “show only changes” unchanged; filtered rows still show the
  templated sentence.

## Non-goals

- Two-pane inspector layout  
- Spatial node-and-edge canvas  
- Invented area names, purpose blurbs, or curated glossaries beyond existing
  display-language kind/relation labels  
- New clustering or analyzer heuristics for prettier demos  

## Verification

- Unit tests for summary templates, dedupe, role line, section order, and
  supporting-collapsed markup.
- Existing Observed Areas UI/projection tests still pass.
- Manual: Kalakar dashboard landing rows answer “what is this / what does it
  mainly change” without opening every area.
