# ADR 0005: Human-Ratified Seeds, Builder Witnesses, and Deterministic Reconciliation

Status: Accepted

## Context

Varai's System Model observes what a repository contains. Builders supervising AI-written code
also need to check what the system was *supposed* to do against what was actually built, without
trusting the builder's own explanation. The seed → build → verify slice (see
`docs/superpowers/plans/2026-07-23-seed-build-verify-vertical-slice.md`) introduces three artifacts
with different authority:

1. A **seed** — structured source intent, drafted with LLM assistance but ratified only by an
   explicit human action.
2. A **realization witness** — the builder's testimony about which artifact boundaries realize
   which seed concepts. It is untrusted provenance, never a verdict.
3. **Reconciliation** — a deterministic projection that checks seed commitments against the
   independently observed System Model.

The risk this ADR forecloses is the re-introduction of a second product model: the seed could
drift into an analyzer IR, the witness into a persisted combined graph, or reconciliation into an
LLM-judged report.

## Decision

- `varai.seed.json` lives at the repository root and is human-ratified source intent. Its semantic
  content hash excludes ratification metadata; Git supplies its history. The seed is a source
  program, not an analyzer IR.
- `varai.realization.json` lives at the repository root and is builder testimony. It names the
  exact seed hash it was built against and binds seed concepts to observed artifact boundaries
  (lens, kind, key) with source file/symbol evidence only as a fallback selector. A realization
  file is never a verdict and never enters a snapshot.
- The System Model remains the only public, persisted, versioned analyzer model (ADR 0004).
  Reconciliation is a pure, deterministic projection over ratified seed + realization witness +
  canonical System Model + coverage. It mutates nothing and persists no combined graph.
- Seed vocabulary is bounded to concept roles `actor`, `behavior`, `resource`, `condition`,
  `outcome` and the checkable relations `invokes`, `accepts`, `requires`, `reads`, `changes`,
  `creates`, `removes`, `produces`, `fails_with`, `emits` — all already represented in the System
  Model relationship vocabulary. `forbids`, temporal logic, cardinality logic, and a general
  invariant language are deferred.
- Binding states are `unbound`, `resolved`, `ambiguous`, `stale`. Verification verdicts are
  `holds`, `violated`, `cannot_verify`, `not_checkable`. A missing Claim becomes `violated` only
  when the capability responsible for that relation reports `analyzed` for the resolved scope;
  otherwise the result is `cannot_verify`. Binding state and verdict stay separate.
- No LLM participates in validation, resolution, or verdicts. The seed assistant is an untrusted
  drafting boundary behind a small provider interface; it cannot write or ratify the seed, sends
  only conversation and current seed (never repository code), and every outbound request requires
  an explicit user action.
- The pilot application is Slotkeeper: a separate greenfield repository (`varai-slotkeeper-pilot`)
  with a React/Vite UI, FastAPI API, SQLAlchemy/SQLite persistence, and a notification outbox
  boundary. Analyzer gaps discovered there are reduced to small fixtures inside Varai.

## Consequences

- Renames preserve stable concept IDs; changing semantic content invalidates the old ratification
  hash and therefore every witness built against it, until witnesses are reconciled or carried
  forward.
- Absence discipline carries over from the System Model: open-world implementation details are
  never reported as unauthorized behavior; closed-scope orphan detection is a later gate.
- The build handoff is a vendor-neutral Markdown/JSON packet the user pastes into any coding
  agent; Varai does not orchestrate builders.
- The dashboard gains seed authoring and domain review views; mutation endpoints stay bound to
  `127.0.0.1`, bounded, origin-checked, and confined to the fixed seed file with atomic writes.
- The seed relation vocabulary may include recorded-only relations (`performs`) that validate as
  intent but reconcile to `not_checkable` until a responsible analyzer capability exists. The
  witness shape "many concepts sharing one artifact", though permitted in principle, is treated by
  the verifier as `ambiguous` (`concept-collision`): honest `cannot_verify` is preferred over a
  possibly-false `holds` when one observed element is claimed by more than one concept.
