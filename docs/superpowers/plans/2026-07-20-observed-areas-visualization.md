# Observed Areas Visualization

**Date:** 2026-07-20  
**Status:** Implemented (experimental presentation; Region not promoted)
**Depends on:** `2026-07-20-first-semantic-region-graph.md`, `2026-07-20-first-behavioral-envelope.md`, `2026-07-19-dashboard-system-interface-design.md`

## Goal

Turn Varai's recovered interaction contexts, behavioral envelopes, effects, outcomes, and shared
resource intersections into a useful human-readable system picture.

This is a presentation and product-anchoring experiment. It does not promote `Region` into the
canonical System Model, invent a product taxonomy, or claim that the recovered areas are the one
correct architecture of the repository.

## Product shape

The primary dashboard view becomes **Observed areas**, presented as a structured semantic outline
rather than a raw inventory or free-form node graph.

An area should answer:

1. Where in the system does this interaction happen?
2. What can be done there?
3. What does each operation change, create, remove, or produce?
4. What important conditions or outcomes are observed?
5. Which shared system parts does the area use?
6. What evidence supports the presentation?

Example:

```text
PLAN CANVAS                                      12 operations

  Add wall                    changes Building Model
  Add window                  changes Building Model
  Inspect quantities          produces Quantity Summary
  Change structural basis     changes Building Model
                              may fail when preview is stale

  Uses shared system parts
  Building Model + Shell Topology
```

Opening an operation reveals its proven path:

```text
Plan Canvas
  -> Add wall
  -> API operation
  -> changes Building Model
  -> evidence
```

Technical routes, symbols, and file locations are evidence below the semantic presentation, not
the primary reading surface.

## Honesty boundary

- Call the projection **Observed areas**, not domains, features, architecture, or bounded contexts.
- Use recovered screen and surface names. Do not invent area names such as "Authoring" or
  "Project Management."
- Keep partial and ambiguous findings attached to the affected operation or area.
- Keep ungrouped envelopes visible under **Not placed in an observed area**.
- Show shared cores once and link to them from each parent. Never merge independent parents because
  they use the same resources.
- Keep the projection derived and non-persisted. The canonical System Model remains the only public,
  versioned product model.

## Phase 1: expose the experimental projection

Add `semanticRegionCandidates(model)` to the server's projection payload.

Requirements:

- The server only serializes a core projection; it derives no semantic structure itself.
- The projection is not stored in snapshots and does not participate in semantic identity or diff.
- Existing model, snapshot, CLI, and dashboard contracts remain compatible.
- Tests cover the server payload and deterministic ordering.

## Phase 2: compose area presentation records

Create a deterministic presentation projection from existing semantic-region candidates and
behavioral envelopes. It should provide, for each interaction area:

- its observed context anchor;
- contained envelope and behavior identifiers;
- operation labels;
- primary effect, output, and outcome claims;
- most-specific shared cores used by the area;
- completeness and reason codes;
- claim identifiers needed to reach evidence.

This is a projection over the System Model, not a second IR. It must contain identifiers and derived
grouping only, with no copied or independently versioned semantic facts.

Supporting implementation reads and derived resources stay available through evidence, but they do
not lead the area summary.

Tests must prove:

- collection-order and display-name invariance;
- no invented labels;
- no parent merging through shared membership;
- most-specific shared-core selection;
- honest ungrouped and partial states.

## Phase 3: replace the landing inventory

Make **Observed areas** the primary System view.

The landing view contains:

- an outline of recovered interaction areas, ranked by meaningful operation count;
- operation count and a short preview of primary effects or outputs;
- local completeness markers where needed;
- shared-core references;
- a visible **Not placed in an observed area** section;
- the existing semantic-change filter applied as an overlay.

The view preserves project scale without presenting hundreds of equal-weight rows. Subjects,
Capabilities, and Everything remain available as secondary and advanced exploration surfaces.

Avoid repeated equal-sized card grids. Use a readable outline with clear typographic levels:

1. area;
2. operation;
3. effect/output/outcome;
4. evidence.

Primary text should remain comfortable at normal desktop viewing distance. Monospace is reserved
for routes, symbols, and code.

## Phase 4: area detail

Opening an area shows:

- its complete operation list;
- each operation's primary effect, output, conditions, and outcomes;
- shared cores used by the area;
- the observed system path;
- expandable source evidence.

The interaction is progressive disclosure. Evidence opens inline; no modal is required. Existing
source-snippet behavior should be reused.

## Phase 5: shared-core navigation

Render each shared core once, with links from every area that uses it.

Example:

```text
Building Model + Section Profiles

Used by:
  Openings panel
  Band editor
  Structural basis panel
```

A core detail view shows its anchor resources, participating areas, relevant operations, and
evidence. Broad and specialized cores retain their existing `uses` relationships. The UI must not
flatten that hierarchy or repeat the entire core under every parent.

## Phase 6: semantic change overlay

Keep change as a dimension of the system view:

- mark affected areas;
- mark affected operations;
- mark affected shared cores when their participating claims changed;
- preserve **show changed only**;
- retain the chronological Changes view as a secondary surface.

No new diff semantics are introduced in this slice. The UI maps existing changed element and claim
identifiers onto the presentation projection.

## Kalakar acceptance slice

Dogfood the visualization against three distinct parts of Kalakar:

1. Plan Canvas operations, including wall or window editing.
2. Quantity inspection and related outputs.
3. Rendering/export operations and their produced artifacts.

The slice passes when a developer unfamiliar with the relevant code can answer, from the primary
view:

- What can be done in the Plan Canvas?
- What does each representative operation change or produce?
- How is Quantity Inspection distinct from authoring operations?
- How are Rendering and Export distinct from editing?
- Which areas reuse the Building Model without being collapsed together?
- Which statements are partial, and how can their exact evidence be opened?

If these answers are not immediate, improve the presentation composition or underlying evidence.
Do not add guessed domain classifications to make the demonstration look complete.

## Verification

- Focused projection tests for area composition and shared-core navigation.
- Server payload tests.
- UI rendering tests for populated, partial, ungrouped, empty, and changed-only states.
- `npm test` passes.
- `git diff --check` passes.
- Start the dashboard with `node ./bin/varai.js start <kalakar> --no-open` and manually verify the
  three acceptance slices at normal desktop size and a narrow viewport.
- Confirm that every displayed semantic statement reaches canonical claims and source evidence.

## Explicitly out of scope

- Canonical `Region` vocabulary or schema changes.
- Persisting presentation records or region candidates.
- AI-generated names, explanations, classifications, or judgments.
- Intent reconciliation or implementation validation.
- A spatial node-and-edge canvas.
- Additional clustering heuristics introduced only to improve the visualization.
- Generalizing beyond the current supported evidence before the Kalakar slice proves useful.

## Implementation order

1. Server exposure and presentation projection.
2. Focused projection and payload tests.
3. Observed Areas landing view.
4. Area detail and evidence descent.
5. Shared-core navigation.
6. Change overlay.
7. Kalakar dogfood and documented findings.

Stop after the Kalakar review before promoting any experimental region concept into the canonical
language or expanding analyzer scope.
