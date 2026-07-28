# Status & direction

Varai is pre-release and published to invite opinions. This page is an honest
account of what works, what doesn't yet, and where the effort goes next. The
motivating idea is in [the-varai-idea.md](the-varai-idea.md); the accepted
product decisions are [ADR 0004](adr/0004-system-model-is-the-product.md) and
[ADR 0005](adr/0005-seed-realization-and-reconciliation.md).

## What runs

- **System Model.** One local, deterministic, evidence-backed model of a
  repository. Every Element and Claim points to source evidence and carries
  explicit analyzer coverage. This is the product boundary.
- **Map, snapshot, diff, dashboard.** Current-system views, Git-bound
  checkpoints, semantic progression between two points, and a live local web UI
  — all projections over the one model.
- **Arch units.** Element→Element `depends_on` claims, lifted from imports and
  rolled up to module-grain units, are shown in the dashboard's Code map.
  Dependency extraction currently reads Python imports only, so units appear
  without edges in other languages — the surface says so rather than implying
  an absence of dependencies.
- **Intent → build → verify.** Recoverable multi-turn Seed drafting, explicit
  Seed polarity, a vendor-neutral build packet, recorded build sessions, and
  deterministic reconciliation are wired end to end. A realization remains
  untrusted testimony; provenance is reported separately from requirement
  verdicts.

## What is unproven

- **The binding mechanism.** The open question is whether a seed claim can be
  bound to a computational artifact and checked *without laundering a
  probabilistic guess into a deterministic verdict*. Reconciliation is
  deterministic only when the binding is **declared** (in the witness), not
  inferred. Whether declared bindings stay honest, cheap, and complete enough on
  real projects is the load-bearing thing still being tested.
- **Seed representation.** The minimum common structure a natural seed needs —
  rich enough to bind, loose enough for a human to speak — is not settled.
- **Coverage and meaning drift.** Which absences can be reported, and which
  domain statements are checkable at all versus irreducibly human declarations.
- **Arch-unit identity.** Module-grain unit keys are lexicographically smallest
  evidence files — deterministic rollups, not designated homes. That is not yet
  a name a human can seed an `arch.dependency` rule against. Package/component
  grouping is still needed; separately, real framework-heavy Python repos today
  often emit units with zero attributed `depends_on` claims.

## What's next

- Improve FastAPI dependency tracing so more real operations reach exact
  effect/failure coverage. The omission trial is now proven for a small route;
  the existing availability route remains honestly `cannot_verify`. See
  [product-loop-pilot.md](product-loop-pilot.md).
- Run adversarial pilot trials for lying, stale, ambiguous, refactored, and
  expected-absent requirements; use the results to narrow the contract before
  expanding the language.
- Grow analyzer coverage where it changes a real decision on a real repo, not to
  chase framework breadth for its own sake.
- Register analyzers behind a stable contract so new framework support never
  touches the kernel, diff, persistence, or rendering.

## Deliberately deferred

- Hosted repository upload; LLM-first discovery; exhaustive framework coverage;
  runtime guarantees without runtime evidence; generic architecture diagrams.

## Non-goals

An optional LLM may later *explain* already-proven model claims, but it never
discovers or authorizes a claim and is never required for deterministic output.
No user-facing statement is ever an unattributed model opinion.
