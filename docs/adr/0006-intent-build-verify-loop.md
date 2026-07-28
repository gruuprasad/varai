# ADR 0006: Recoverable Intent-to-Build Verification Loop

Status: Accepted

## Context

ADR 0005 introduced ratified Seeds, untrusted realization witnesses, and
deterministic reconciliation. The first pilot showed four material gaps: a
matching realization hash did not prove which build produced it; authoring was
one-turn and disappeared on restart; absence checks were too broad to be sound;
and the builder packet overstated mandatory witnesses.

## Decision

- A Seed remains the sole human-owned specification. The System Model remains
  the sole persisted, versioned analyzer model. Build-session and authoring
  records are audit/workflow records, never a second product IR.
- Relation checking has a single explicit contract. A relation is either
  checkable by a named capability or recorded-only; recorded-only intent never
  becomes a negative verdict.
- Missing and expected-absent claims become a verdict only when the exact
  relevant element or subsystem scope is `analyzed`. Partial coverage yields
  `cannot_verify`.
- Seed format 2 gives every commitment a polarity: `present` or `absent`.
  Existing format 1 seeds remain readable and have an explicit migration that
  produces unapproved format 2 drafts.
- A realization is a binding map. Per-requirement source hints are optional
  narrowing hints, not a prerequisite for checking bound concepts.
- `varai build begin` and `varai build close` record the approved Seed,
  rendered packet, scan configuration, snapshots, realization, and check
  result. Reconciliation exposes recorded, stale, or unattested build
  provenance separately from requirement verdicts.
- Seed Studio persists a local, unapproved authoring session with the bounded
  human/assistant conversation and reviewed proposal. A changed approved Seed
  makes that session stale; approval requires the reviewed exact draft.

## Consequences

The builder and verifier can now distinguish a fresh realization file from a
recorded build. Negative requirements are useful only where coverage is exact;
else Varai says it cannot tell. Local drafting survives dashboard restarts but
does not alter the approved Seed until explicit ratification.
