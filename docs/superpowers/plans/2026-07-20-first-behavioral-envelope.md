# First Behavioral Envelope — Implementation Plan

**Date:** 2026-07-20  
**Depends on:** `docs/superpowers/specs/2026-07-19-anchor-based-lift-design.md`,
`docs/superpowers/plans/2026-07-20-backend-semantic-closure.md`

## Goal

Prove that Varai can assemble its existing static System Model into one useful, human-facing
behavioral envelope without building an executable program slice.

The first acceptance case is Kalakar's structural-type update:

```text
StructuralBasisTypesPanel
  -> Apply change
  -> available only after preview and required acknowledgement
  -> PUT /building-model/{job_id}/structural-types/{type_id}
  -> accepts the structural-type update contract
  -> changes BuildingModelDocument
  -> produces the mutation/catalog response
  -> can fail when the preview is required or stale
```

The output is a **derived semantic projection over existing Elements and Claims**. It is not an
executable subset of the source, a claim that this exact path ran, or a second public model.

## Product boundary

This increment answers only:

> Given one already-resolved cross-interface behavior, can Varai assemble the relevant static
> evidence into a coherent cause-to-effect view?

It does not attempt to discover semantic regions yet. A later experiment may group envelopes after
several of them prove useful.

Explicitly out of scope:

- CFG, SSA, alias analysis, symbolic execution, or runtime instrumentation;
- CodeQL, Joern, Semgrep, or another analysis dependency;
- AI classification, naming, or summarization;
- generic graph/community clustering;
- promotion of private helpers into public Behaviors;
- new System Model Elements, roles, relations, schema fields, or persisted objects;
- claiming exact runtime order across callbacks, promises, or services;
- frontend post-success state recovery that the canonical model does not yet contain;
- dashboard redesign or semantic-region visualization.

## Core definition

A **behavioral envelope** is an evidence-backed assembly of existing Behavior frames along one
public System path.

It has fixed semantic sections rather than an asserted runtime sequence:

```text
entry context
trigger
conditions
inputs
reach
primary effects
supporting effects
outputs
outcomes
gaps
```

The section order is presentation language. Runtime order is claimed only where an existing
`invokes` Claim or implementation path directly supports it.

## Projection contract

Add `behavioralEnvelopes(model)` as a pure projection. It consumes `behaviorFrames(model)` and
`systemPaths(model)` and returns deterministic JSON:

```js
{
  kind: "behavioral-envelopes",
  envelopes: [{
    id,                       // derived from the stable System path ID
    name,
    entryBehaviorId,
    terminalBehaviorId,
    behaviorIds,
    interfaceIds,
    triggerClaimIds,
    conditionClaimIds,
    inputClaimIds,
    invocationClaimIds,
    primaryEffectClaimIds,
    supportingEffectClaimIds,
    outputClaimIds,
    outcomeClaimIds,
    primarySubjectIds,
    supportingResourceIds,
    unresolvedClaimIds,
    implementationEvidence,
    completeness,             // closed | partial | open
    completenessReasons,
  }],
  diagnostics,
}
```

All IDs refer to the canonical System Model. `implementationEvidence` is the canonical union of the
selected Claims' existing evidence and `implementationPath` entries; it does not mint private graph
nodes as public members.

## Deterministic assembly rules

For each existing System path:

1. The first Behavior frame supplies the entry trigger and UI/CLI availability conditions.
2. Every path step remains a Behavior member; each reference `invokes` Claim supplies reach.
3. The terminal frame supplies API/command conditions, inputs, effects, outputs, and outcomes.
4. Mutation relations (`changes`, `creates`, `removes`) on the terminal frame are primary effects.
5. `reads` Claims are supporting effects. They never become primary merely because their target is a
   Resource.
6. Referenced Resources targeted by primary effects become `primarySubjectIds`.
7. Referenced Resources targeted only by supporting effects become `supportingResourceIds`.
8. If several mutation targets are supported, retain all of them. Do not guess one winner.
9. Literal/unbound effect targets remain unresolved Claims and make the envelope partial; `file`,
   `unknown`, context, sessions, and infrastructure never become primary subjects.
10. Contracts remain inputs/outputs, not subjects.
11. Conditions and outcomes retain their original Claim state, qualifiers, evidence, and wording.
12. Collection ordering, evidence ordering, or private helper naming must not change envelope
    identity or section membership.

These rules deliberately avoid general affinity scores. They assemble one known behavior before any
attempt to group behaviors.

## Completeness

Completeness is about semantic closure under declared analyzer coverage, not runtime certainty:

- `closed`: a reference invocation reaches a terminal Behavior with at least one referenced primary
  effect or explicit outcome, and no unresolved effect Claim is included;
- `partial`: useful entry/reach/effect information exists, but an effect is unresolved or one of the
  required sections cannot be bound;
- `open`: no referenced terminal Behavior or no supported effect/outcome is reached.

The projection must include reason codes such as:

```text
resolved-primary-effect
resolved-outcome
missing-trigger
unresolved-effect
missing-terminal-effect-or-outcome
```

Global analyzer diagnostics remain visible separately. This increment must not pretend to localize a
repository-wide `untraced-call` diagnostic to one envelope.

## Gate 1 — Lock the projection with generic tests

### Files

- Add `src/system-model/projections/behavioral-envelopes.js`
- Modify `src/system-model/projections/index.js`
- Extend `test/system-model/anchor-projection.test.js`

### Tests

Using the existing generic anchor fixture, prove:

- UI action and API operation are assembled into one envelope;
- trigger, condition, input, invocation, mutation, output, and outcome Claims land in their sections;
- mutation targets are primary while read targets are supporting;
- contracts never become subjects;
- unresolved literal effects make an envelope partial;
- reversed model collection order produces byte-equivalent output;
- private evidence movement does not change the envelope ID or semantic membership.

Do not modify extractor logic in this gate.

## Gate 2 — Strengthen the structural acceptance fixture

### Files

- Modify `test/fixtures/semantic-assembly-structural/src/components/StructuralBasisTypesPanel.tsx`
- Modify `test/fixtures/semantic-assembly-structural/routes.py`
- Modify `test/fixtures/semantic-assembly-structural/domain.py` only if the current fixture lacks an
  evidence-backed domain outcome
- Extend `test/system-model/semantic-assembly-structural.test.js`

Keep the fixture small, but mirror the meaningful shape already present in Kalakar:

- `Apply change` is rendered after preview;
- it is unavailable while busy, without a job, or when integrity changes require acknowledgement;
- it invokes the PUT operation;
- the operation accepts `UpdateStructuralTypeRequest`;
- the domain operation changes `BuildingModelDocument` through the existing untyped wrapper and
  callable-value chain;
- the operation produces `StructuralTypeMutationResponse`;
- a directly observable 409 outcome represents required/stale preview.

Assert the assembled envelope contains those sections and does not headline `JobContext`, `file`,
`unknown`, response contracts, or supporting read models as primary subjects.

If an assertion fails because the canonical model lacks a Claim, record that as a focused analyzer
gap. Add only the smallest generic extraction rule needed to produce that Claim; do not put AST or
fixture-specific logic inside the projection. Any extractor change must bump `EXTRACTOR_VERSION` in
`src/scanners/cache.js` and `SYSTEM_MODEL_ANALYZER_VERSION` in `src/system-model/version.js`.

## Gate 3 — Present the envelope without a UI redesign

### Files

- Modify `src/reporters/system-model-markdown.js`
- Modify `src/server/index.js`
- Modify `src/ui/app.js` only to consume the structured envelope in the existing expandable System
  path card
- Add or extend focused reporter/server tests where the repository already has coverage

### Rendering

Replace the flat `action -> endpoint -> subjects` path detail with the envelope's semantic sections.
Keep the list row compact; expansion shows:

```text
Apply change
  When       preview exists; acknowledgement is given when integrity changes
  Sends      UpdateStructuralTypeRequest
  Through    PUT /.../structural-types/{type_id}
  Changes    BuildingModelDocument
  Returns    StructuralTypeMutationResponse
  May fail   409 preview required or stale
```

Each line links to the underlying Claim evidence through the existing source-snippet mechanism.
Supporting reads appear under a secondary “Uses” section rather than beside the primary change.
Unresolved sections render explicitly.

Use wording such as **derived behavior** or **static behavior envelope**. Do not label it a runtime
trace or claim that it was observed executing.

## Gate 4 — Kalakar dogfood

Run a fresh Kalakar scan and inspect the real `Apply change` envelope in structured JSON, Markdown,
and the existing dashboard card.

Acceptance checklist:

- entry context is `StructuralBasisTypesPanel`;
- action is `Apply change`;
- preview/acknowledgement availability is visible;
- reach is the PUT structural-type operation;
- request and response contracts are visible but not subjects;
- `BuildingModelDocument` is a primary changed subject;
- derived geometry/resources, if present, are under supporting reads rather than flattened beside the
  primary subject;
- 409 is visible as an outcome with evidence;
- private helpers appear only in evidence drill-down;
- no runtime-execution claim is made;
- gaps remain explicit;
- output is materially easier to explain than the current two-hop path.

Inspect one unrelated Kalakar path as a guardrail. Record any missing Claim or incorrect frontend-to-
API join, but do not expand this increment into generic region discovery.

## Verification

Run:

```text
node --test test/system-model/anchor-projection.test.js
node --test test/system-model/semantic-assembly-structural.test.js
npm test
git diff --check
```

Also verify:

- native/WASM and serial/worker parity remain covered by the existing full suite;
- the projection does not mutate or persist the System Model;
- schema version remains unchanged;
- analyzer/cache versions remain unchanged unless extractor logic changes;
- `src/system-model/projections/behavioral-envelopes.js` imports no scanner, framework, reporter, UI,
  or Kalakar-specific code;
- the worktree contains no scratch scan scripts or generated output.

## Completion decision

After dogfooding, make only one decision:

> Does this rough static envelope provide a credible human behavior unit from the existing graph?

If yes, recover several more envelopes and study their overlap before designing semantic regions. If
no, classify the failure precisely as missing entry context, missing reach, missing control condition,
missing effect, missing outcome, or bad subject role. Improve that evidence axis first; do not add
clustering or AI to compensate.
