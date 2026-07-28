# ADR 0007: Product Control Room on a Constrained Substrate

Status: Accepted

## Context

ADR 0006 closed the intent → build → verify loop, but the pilot exposed what the
loop actually establishes today: mostly structural facts that sit close to
scanner output. Routes exist, entities exist, an import is present. The rules
that make operational software trustworthy — who may act, which state
transitions are legal, what side effects must accompany a decision, and what
behavior exists that nobody asked for — are not yet checked.

Two failure modes are available from here. Varai can broaden: more frameworks,
more languages, a general AI IDE, a generic prompt-to-app builder. Or it can
narrow onto one customer, one application class, and one substrate, and prove
that the semantic checks are real. Breadth without a semantic proof produces a
polished interface over an unproven verifier.

There is also a soundness pressure specific to AI builders. A builder that
cannot satisfy a rule has a cheaper move available than fixing the code: make
the implementation harder to analyze, so a `violated` verdict decays into a calm
`cannot_verify`. Any design that treats reduced analyzability as neutral invites
exactly that.

## Decision

### Product

Varai is a **local product control room for AI-built operational software**, not
a general AI IDE and not a prompt-to-app builder. A person authors and approves
roles, workflows, product surfaces, and concrete behavioral scenarios; an
interchangeable AI builder implements the approved change inside a recorded
build session; Varai independently checks the result and makes missing, extra,
degraded, or unverified behavior impossible to mistake for health.

The initial customer is a domain expert or product owner who understands their
business process, does not want to work primarily through code, will inspect a
product blueprint and approve explicit changes, uses an AI builder, and needs
more confidence than builder-authored prose or tests provide.

The initial application class is multi-role operational and workflow web
applications: requests and approvals, bookings and resource allocation, case
management, membership operations, lightweight internal SaaS.

### Constrained substrate

The first proof supports exactly React/Vite frontends, FastAPI backends,
SQLAlchemy over PostgreSQL or SQLite, synchronous HTTP commands and queries,
local process execution, and one configured AI-builder subprocess. **Framework
breadth is not a success metric.** Unsupported stacks and dynamic route
registration must produce `cannot_account`, never a clean empty result.

### Three authorities, no overlay

There are three durable authorities, and they do not blend:

1. **Seed** — human-owned product intent. An assistant may propose it; only a
   person ratifies it.
2. **System Model** — independently observed repository facts. It remains the
   only public, persisted, versioned analyzer model.
3. **Build/session evidence** — audit records, realization pointers, scenario
   runs, gate decisions. Workflow and evidence records, not a second product IR.

No graph combining Seed and System Model is ever persisted. Blueprint, surface
accounting, reconciliation, and build readiness are pure projections.

### One-way editing

Product chat may create only an unapproved Seed draft. Approval creates an
immutable Seed content hash. A builder may change implementation files and emit
untrusted bindings; a builder may never edit or approve the Seed. The blueprint
is rendered from Seed plus observed System Model and is not independently
editable. No terminal or builder console mutates semantic intent.

### Build state machine

```text
draft -> approved -> building -> verifying
      -> ready | needs_attention | build_failed | superseded
```

`building` requires an exact approved Seed hash. Ratifying a changed Seed while
a build is active marks that build `superseded`; its output can be inspected but
can never become `ready`. Builder exit always transitions through `verifying`.
Any repository change after `ready` makes the state `unattested` until another
recorded verification completes. There is no generic green state that hides
`cannot_verify` results.

### Readiness gate

A build is `ready` only when no ratified requirement is `violated`; no critical
scenario failed or went unexecuted; no required binding is stale, ambiguous, or
unbound; no expected public surface is missing; no observed public surface is
unaccounted; no analyzed critical scope degraded to partial, failed, or
unsupported; and the realization, runtime mapping, Seed hash, tree hash, and
scan configuration all match the completed session.

Every failure yields `needs_attention` with machine-readable reasons. Human
acknowledgement never silently turns an unverifiable critical rule green — that
requires a new Seed decision or a genuine analyzer/runtime capability
improvement.

### Degradation is a result, not a limitation

A transition from `analyzed` to `partial`, `unsupported`, `failed`, or missing on
a critical scope is a **regression** and blocks readiness. Reduced analyzability
is never a neutral outcome, because it is the cheapest way for a builder to hide
a violation.

### Seed v3 adds surfaces and scenarios

Seed v3 keeps v2 concepts, commitments, context, expectation polarity, and
ratification, and adds two human-owned arrays:

- **`surfaces`** — expected externally reachable behavior, described by
  `channel` (`ui | api | webhook | job | cli`) and `access`
  (`public | authenticated | internal`). A surface carries no HTTP path,
  framework name, file, or symbol; those are realization details. Every observed
  externally reachable Element in the supported substrate must map one-to-one to
  a ratified surface, which gives Varai the missing code-to-spec direction: not
  only "was what I asked for built?" but "what exists that I did not ask for?"
- **`scenarios`** — bounded ordered interactions: sequential steps, distinct
  principals bound to actor concepts, behavior invocation, scalar/JSON input,
  references to captured response fields, exact status assertions, and partial
  body assertions. Nothing more. Concurrency, temporal windows, performance,
  arbitrary expressions, database inspection, and user-supplied test code are
  deferred.

Scenarios are **examples, not invariants**. A passing scenario establishes one
concrete interaction. Reports may say "scenario passed"; they may never say "only
owners can ever withdraw."

### Verdict authority

No LLM output may set a verdict, coverage state, surface-accounting state,
scenario assertion, or readiness gate. Builder-authored tests and prose are
supporting testimony only. The runtime map is a pointer to where to check, never
evidence that the thing checked is correct.

## Consequences

Varai gains a specific customer and a specific proof obligation, and gives up
generality it never demonstrated. The proof application is a purchase-approval
workflow, built in a separate sibling repository so its implementation never
becomes a Varai fixture; discovered analyzer defects reduce to small fixtures
here.

The decision point is explicit. If the semantic checks work but target users
reject the workflow, Varai narrows to an AI-development architecture and trust
tool for developers. The response to rejection is never more frameworks or a
larger IDE.

Deferred: general-purpose IDE or browser code editor, arbitrary stacks, hosted
repository upload, production deployment, universal policy or temporal-logic
language, general invariant proving, concurrency and atomicity proof,
performance verification, mobile and native applications, a builder model
marketplace, and any automatic inference of human intent from code.
