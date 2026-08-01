# ADR 0008: Seed v4 — State Models, Field Contracts, and Flows

Status: Accepted

## Context

ADR 0007's gap list says the rules that make operational software trustworthy —
who may act, which state transitions are legal, which side effects must
accompany a decision — are not yet verified. Gate 2 added the observer
evidence (`api.authorization`, `application.state`, strengthened
`data.contract`, the `emits` effect library) so the Seed could declare more
than claim existence. Seed v3 had no way to declare legal transitions, data
shapes, or workflow grouping; scenarios were the only vehicle, and scenarios
are examples, not declarations.

## Decision

Seed format 4 keeps v3's vocabulary and adds three optional, additive
constructs:

1. **`stateModel` on resource concepts** — `initial`, `states`, and
   `transitions` keyed by `(from, to, via behaviors)`. A declared transition
   holds statically only with recognizable from-state/path evidence: a literal
   target-state claim whose `state_from` qualifier names the declared `from`
   (`application.state` capability). A bare target assignment never proves the
   transition; missing path evidence yields `cannot_verify`, never a silent
   pass. Transition identity is `(resource, from, to, via)`; canonicalization
   sorts states and transitions so reordering alone creates no semantic diff.
2. **`fields` on resource concepts** — declared data shapes (`name`, `type`,
   `required`). Declared fields must be covered by observed `has_field` claims
   on the bound data element under `data.contract` coverage, which is
   `analyzed` only when the declaration has parseable class syntax. Type and
   requiredness qualifiers are checked only where syntax proves them.
3. **`flows`** — behavior members grouped behind one surface entry, giving the
   blueprint and verification report a review altitude above individual
   commitments. Flows add no new verdicts; they project member readiness.

Reconciliation consumes only the ratified Seed, the System Model, and
resolved bindings — no combined graph is persisted. The readiness gate blocks
on violated transitions and violated field contracts like any other
requirement. The assistant prompt describes the v4 grammar but remains a
drafting boundary that cannot write or ratify.

## Consequences

v3 seeds remain valid; `varai seed migrate` produces unapproved v4 drafts with
empty `flows`. The handoff packet renders state models, fields, and flows.
State-model and field-contract changes ride on concept diffs, so
carry-forward eligibility and semantic hashes behave exactly as before.
