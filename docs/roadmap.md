# Status & direction

Varai is pre-release and published to invite opinions. This page is an honest
account of what works, what doesn't yet, and where the effort goes next. The
motivating idea is in [the-varai-idea.md](the-varai-idea.md); the accepted
product decisions are [ADR 0004](adr/0004-system-model-is-the-product.md),
[ADR 0005](adr/0005-seed-realization-and-reconciliation.md), and
[ADR 0007](adr/0007-product-control-room-and-constrained-substrate.md).

## What Varai is aiming at

A **local product control room for AI-built operational software** — not a
general AI IDE and not a prompt-to-app builder. The first customer is a product
owner who does not want to work primarily through code; the first application
class is multi-role workflow software; the first substrate is exactly
React/Vite, FastAPI, and SQLAlchemy. Framework breadth is explicitly not a
success metric. The contract, including what each kind of evidence can and
cannot prove, is [product-control-room.md](product-control-room.md).

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
- **Builder loop (Gate 1).** `varai realization lint` resolves a witness in
  one read-only command with deterministic candidates; `varai handoff --json`
  carries the full Seed diff and carry-forward candidates against the latest
  prior `ready` session; `varai handoff --schema` publishes structural JSON
  Schemas; `varai runtime derive` regenerates operation mappings without
  inventing profile fields; binding continuity reports `carried`/`rebound`
  with the old element's fate — no separate ledger.
- **Evidence semantics (Gate 2).** `api.authorization` (guard recognition with
  exact condition clauses and `analyzed`/`partial` discipline),
  `application.state` (literal target-state assignments plus from-state/path
  evidence), strengthened `data.contract` (type and requiredness qualifiers
  where syntax proves them), and the `emits` effect library (outbox/queue and
  external-HTTP) make `requires`, `changes`, and `emits` statically checkable
  on the FastAPI slice. Inverted authorization is now caught statically, not
  only by scenarios.
- **Seed v4 (Gate 3).** State models, field contracts, and flows are declared
  in the Seed, validated, canonicalized, migrated, diffed, rendered in the
  handoff packet and the dashboard's Blueprint and Seed Studio, and reconciled
  with verdicts; the readiness gate blocks on violated transitions and field
  contracts. Existing v3 seeds remain valid and migrate to unapproved v4
  drafts.

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
- **Product-rule verification.** What is checked today is mostly structural and
  sits close to scanner output: routes, entities, effects, imports. The rules
  that actually make operational software trustworthy — who may act, which state
  transitions are legal, which side effects must accompany a decision — are not
  yet verified. Expected surfaces and executable scenarios exist as a decided
  language ([ADR 0007](adr/0007-product-control-room-and-constrained-substrate.md))
  and a worked example, not yet as an implementation.
- **Whether the audience wants this.** No target user has run the loop. If the
  semantic checks work but product owners return to raw builder chat, the honest
  response is to narrow toward a developer-facing architecture and trust tool —
  not to add frameworks or grow an IDE.
- **Arch-unit identity.** Module-grain unit keys are lexicographically smallest
  evidence files — deterministic rollups, not designated homes. That is not yet
  a name a human can seed an `arch.dependency` rule against. Package/component
  grouping is still needed; separately, real framework-heavy Python repos today
  often emit units with zero attributed `depends_on` claims.

## What's next

- **Human evaluation (Gate H).** The product release gate is still pending:
  run `docs/poc/purchase-approvals-human-eval.md` once against the completed
  Gate-3 slice with five target users before broadening. Gates 4–6
  (real-repo adoption, control room depth, second substrate proof) do not
  begin before Gate H passes.
- Extend exact effect/failure coverage past the FastAPI slice. All three real
  Slotkeeper operations now reach `analyzed` — a body trace no longer mistakes
  signature mechanics (`Depends`, `Header`) or a declared model constructor for
  an unresolved call — so omission is soundly reportable there. `api.condition`
  and `api.input` remain subsystem-scoped `partial`, which is why one
  requirement is still honestly `cannot_verify`. The before/after is in
  [product-loop-pilot.md](product-loop-pilot.md).
- Make coverage degradation a build result rather than a neutral limitation. A
  builder that cannot satisfy a rule can otherwise make the code harder to
  analyze and watch `violated` decay into a calm `cannot_verify`.
- Add ratified surfaces and surface accounting, so the check answers "what public
  behavior exists that nobody asked for?" and not only "was what I asked for
  built?" (implemented in the builder loop; adversarial trials recorded).
- Execute ratified scenarios independently against a running application, to
  reach authorization and state-transition mistakes that static evidence cannot
  settle.
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
- A general-purpose IDE or browser code editor; arbitrary application stacks;
  production deployment and hosting; a universal policy or temporal-logic
  language; general invariant proving; concurrency and atomicity proof;
  performance verification; mobile and native applications; a builder model
  marketplace; any automatic inference of human intent from code.

## Non-goals

An optional LLM may later *explain* already-proven model claims, but it never
discovers or authorizes a claim and is never required for deterministic output.
No user-facing statement is ever an unattributed model opinion.
