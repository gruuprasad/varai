# First Semantic Region Graph — Implementation Plan

**Date:** 2026-07-20  
**Depends on:** `docs/superpowers/specs/2026-07-19-anchor-based-lift-design.md`,
`docs/superpowers/specs/2026-07-19-semantic-assembly-acceptance-corpus.md`,
`docs/superpowers/plans/2026-07-20-first-behavioral-envelope.md`

## Goal

Test whether Varai can deterministically recover a useful hierarchical, overlapping organization
from its current behavioral envelopes.

The central invariant is:

> A semantic part shared by several regions becomes one reusable subregion. It does not merge the
> surrounding regions into one connected component.

For example, the desired shape is:

```text
Plan authoring ------uses----┐
Structural editing --uses----+--> shared Building Model core
Quantities ----------uses----+
Rendering -----------uses----+
Export --------------uses----┘
```

The labels above are evaluation language only. The first implementation recovers membership and
region relationships, not those names or classifications.

## Product boundary

This is a discovery projection over the canonical System Model. It must not add `Region` to the
kernel, persist region objects in snapshots, or introduce a second public IR.

This slice answers only:

> Do existing containment, behavior, subject, output, and outcome relationships contain enough
> structure to recover distinct parent candidates and reusable shared-core candidates?

Explicitly out of scope:

- generic connected components, Louvain/community detection, embeddings, or lexical similarity;
- AI naming, classification, membership, or boundary decisions;
- filenames, directories, framework component names, or import topology as semantic membership;
- choosing a fixed number of regions;
- forcing every envelope or Element into a region;
- flattening shared subregions into every parent;
- declaring one canonical hierarchy where the evidence supports overlap;
- dashboard redesign, map replacement, or user-facing region names;
- kernel/schema/analyzer-version changes;
- new extraction rules unless dogfood exposes a separately approved evidence gap.

## Model of the projection

The projection is a small **overlapping region graph**, not a partition or a mathematical lattice.
Multiple parents may reference the same subregion, so the relationship structure is a directed
acyclic graph when only containment/usage dependencies are considered.

- A parent candidate represents a distinct interaction or behavior context.
- A shared-core candidate represents semantic machinery used by two or more distinct parents.
- `contains` represents evidence-backed nesting.
- `uses` represents reuse without ownership or merging.
- One envelope, Behavior, Resource, or subregion may participate in several candidates.
- Parent candidates remain distinct even when they use the same shared core.

Projection-local `contains` and `uses` records are not new System Model Claims. They refer only to
canonical Element, Claim, envelope, and evidence IDs.

## Projection contract

Add `semanticRegionCandidates(model)` as a pure projection consuming
`behavioralEnvelopes(model)` and existing canonical containment Claims:

```js
{
  kind: "semantic-region-candidates",
  regions: [{
    id,                         // derived only from stable canonical anchors
    basis,                      // interaction-context | shared-resource-core
    anchorElementIds,
    envelopeIds,
    behaviorIds,
    interfaceIds,
    subjectIds,
    artifactIds,
    claimIds,
    completeness,               // supported | partial
    reasonCodes,
  }],
  relationships: [{
    id,
    relation,                   // contains | uses (projection vocabulary)
    sourceRegionId,
    targetRegionId,
    envelopeIds,
    claimIds,
  }],
  diagnostics,
}
```

The projection must be deterministic under collection reordering and private evidence movement.
Display names and evidence locations must not contribute to region identity.

## Gate 1 — Derive normalized envelope participation

### Files

- Add `src/system-model/projections/semantic-region-candidates.js`
- Modify `src/system-model/projections/index.js`
- Add `test/system-model/semantic-region-candidates.test.js`

For every behavioral envelope, derive a normalized participation record from canonical IDs:

- entry and reached Behavior IDs;
- containing screen/surface/interface IDs already proven by canonical `contains`/`offers` Claims;
- primary subject IDs;
- supporting resource IDs, kept separate;
- produced Artifact IDs;
- effect, output, outcome, containment, and invocation Claim IDs.

Contracts, unresolved literals, diagnostics, files, private implementation nodes, and evidence paths
must never become region anchors.

Tests must prove deterministic output, no private-node leakage, and no dependence on names or file
layout.

## Gate 2 — Recover interaction-context parent candidates

Create a parent candidate from an existing public interaction context only when at least two
behavioral envelopes are proven to belong to it.

Initial supported context evidence:

1. a Screen canonically `contains` a Surface whose actions enter the envelopes;
2. a Surface canonically `offers` the entry actions;
3. nested Screen -> Surface contexts remain nested candidates when both independently meet the
   envelope threshold.

Rules:

- A candidate's membership is the union of envelopes directly proven under that context.
- Screen and Surface candidates do not merge merely because they reach the same Resource.
- A Screen candidate may `contain` a Surface candidate only when the canonical containment Claims
  and envelope membership both support it.
- Singleton contexts remain ungrouped in this first experiment; they are not evidence of a region.
- UI context is the first supported parent mechanism, not a universal definition of Region. CLI,
  worker, library, or API-only parent mechanisms remain explicitly unsupported.

Tests must prove distinct contexts remain distinct even when all their envelopes affect one common
Resource.

## Gate 3 — Recover reusable closed intersections

Shared cores are closed repeated intersections, not one candidate per common Resource.

1. Use only leaf interaction parents when discovering cross-parent intersections. A Screen and its
   contained Surface are one hierarchy branch, not independent consumers.
2. For every pair of independent parents, intersect the resolved Resources used by their envelopes.
3. Compute the intersection's full parent extent, then close it to the maximal Resource set shared
   by that extent.
4. Deduplicate equal closed intersections by canonical Resource IDs.
5. Require at least two distinct parents, two reached Behaviors, and resolved semantic effect or
   Artifact-output Claims.
6. Contracts, unresolved literals, files, and private implementation nodes cannot enter an
   intersection.

Each candidate contains its complete Resource intent, participating reached Behaviors, envelopes,
and exact Claims. A parent references only its most-specific applicable shared intersection.
Specialized shared cores reference their nearest broader shared cores, preserving reusable nesting
instead of repeating the broad core in every parent.

Do not discard a frequently used Resource as a “hub.” It may become the broadest common core. The
protection against collapse is structural reuse through `uses`, not hub suppression or parent
union. A Resource used within only one hierarchy branch remains ordinary parent membership.

## Gate 4 — Lock hierarchy and overlap invariants

Use a small neutral synthetic System Model or concept fixture with:

- two interaction parents;
- two or more envelopes under each parent;
- one shared persistent Resource;
- one parent-specific Resource or Artifact per parent;
- explicit containment, invocation, and effect Claims.

Prove:

- two parents remain distinct;
- exactly one common shared-core candidate is recovered;
- both parents `use` that same candidate;
- the shared candidate does not contain the parents;
- parent-specific participants do not leak across the boundary;
- an envelope may participate in its parent and the shared core;
- canonical containment can produce parent/subregion `contains` without flattening;
- removing one parent's effect removes its `uses` edge rather than merging or deleting the other
  parent;
- evidence-only refactors preserve every candidate and relationship ID;
- a real containment/effect change produces a meaningful projection change.

Add explicit negative cases:

- same Resource but no resolved effect;
- one parent only;
- shared contract only;
- common implementation file only;
- disconnected contexts with similar names.

## Gate 5 — Kalakar dogfood

Run the projection over a fresh Kalakar model and inspect structured JSON only. Do not add UI or
Markdown rendering in this gate.

Record the results in the semantic-assembly acceptance corpus:

- number of interaction-context parent candidates;
- number of shared-core candidates;
- parent -> shared-core `uses` relationships;
- envelopes that remain ungrouped and why;
- any accidental boundary leakage;
- whether one Building Model-related core is reused without unioning its surrounding parents;
- whether authentication/project lifecycle stays separate from model authoring/render/export work;
- whether screen/surface containment merely reproduces compute UI anatomy rather than a useful
  behavioral organization.

Kalakar labels are used only for human evaluation. No expected name, number of authoring surfaces,
route prefix, class, component, or directory may enter the algorithm.

## Decision gate

Promote this direction into a semantic-language design only if Kalakar demonstrates all of:

1. at least two distinct parent candidates remain separate while using the same shared core;
2. the shared core contains meaningful Behaviors and effects, not only one repeated noun;
3. parent-specific actions, artifacts, and outcomes remain local;
4. overlap makes the system easier to explain than the current flat subject/envelope views;
5. the result is stable under evidence-only refactoring.

If the output groups only by screens/components, the slice has recovered UI architecture rather
than semantic regions. If it groups only by Resources, it has recovered the subject map. If either
happens, keep the projection experimental and identify the missing parent-boundary evidence before
adding more grouping heuristics.

## Verification

- focused projection tests;
- full `npm test`;
- `git diff --check`;
- source syntax checks;
- fresh Kalakar scan with recorded candidate metrics;
- no extractor or analyzer version bump unless extraction changes are separately approved;
- no canonical System Model, snapshot, diff, or renderer changes in this slice.
