# Product control room

This is the current product contract for Varai. It describes the implemented
local workflow; the normative Seed and System Model vocabulary lives in
[semantic-language.md](semantic-language.md).

## Product promise

Varai is the human interface to an AI-assisted application-development loop:

```text
human conversation
  → reviewed and ratified Seed
  → recorded local AI build
  → independent static and runtime evidence
  → next change in the same conversation
```

The person should not need to leave Varai to edit a requirements file, paste a
build brief into another chat, or decide whether the builder's own explanation
is true. The dashboard brings those activities together while preserving their
different authorities.

Varai is local-first and pre-release. It is a control surface for bounded,
evidence-backed development, not an IDE, deployment platform, or universal
program verifier.

## Roles and authority

| Role | Can do | Cannot do |
| --- | --- | --- |
| Human | edit intent, resolve questions, approve a Seed, change direction | delegate ratification to an AI |
| Product assistant | ask questions and propose a Seed draft | read repository code, write/approve a Seed, set a verdict |
| Builder | modify the project in a recorded session and emit pointers | approve intent, set evidence, or set readiness |
| Verifier | scan, reconcile, run scenarios, and report coverage | infer human intent or silently upgrade uncertainty |

The assistant and builder are replaceable local command adapters. The generated
project currently configures Codex CLI with model `gpt-5.6-luna` for both roles.
There is no API-platform integration or silent repository upload.

## One source of intent, one model of evidence

Varai keeps three durable authorities separate:

1. **Seed (`varai.seed.json`)** — human-ratified product intent. It contains
   concepts, commitments, surfaces, scenarios, context, and Seed v4 state
   models, field contracts, and flows.
2. **System Model** — the one canonical, versioned, evidence-backed model of
   what repository analyzers observed. Parser observations are private details.
3. **Build evidence** — session records, snapshots, builder events,
   interventions, realization/runtime pointers, scenario results, and gate
   decisions.

The realization and runtime files are pointers supplied by the builder. They
are checked against the current System Model and never become proof by
themselves. Blueprint, reconciliation, surface accounting, and readiness are
projections; Varai does not persist a combined intent/code graph.

## The working loop

### 1. Develop

The Develop conversation receives a product request and keeps a recoverable
conversation plus a proposed Seed draft. The assistant may clarify ambiguity or
identify an uncheckable claim. Unsupported statements stay visible as context
or an unresolved question.

### 2. Review and approve

The human reviews the structured draft, resolves questions, and explicitly
approves it. Approval freezes a semantic content hash. A later product change
creates a new draft and invalidates witnesses made for the old hash.

### 3. Build

Varai renders a vendor-neutral packet and starts the configured local builder.
The session records the exact Seed hash, repository state, builder events,
messages, and interventions. The builder can write application files and emit:

- `varai.realization.json` — concept-to-artifact pointers;
- `varai.runtime.json` — operation, persona, and start-command pointers.

Both are untrusted testimony. `varai realization lint` and runtime validation
make their failures explicit.

### 4. Verify

Varai independently:

- scans the repository into the System Model;
- reconciles commitments against Claims and coverage;
- accounts for expected and unexpected public surfaces;
- runs bounded, ratified runtime scenarios;
- compares coverage and requirement verdicts with the build's starting point;
- records progression to the next session.

An AI agent may perform a scoped black-box reviewer pass over the running app,
but its report is advisory. It cannot override deterministic evidence or human
approval.

## Build states

```text
draft → approved → building → verifying
              ↘ ready | needs_attention | build_failed | superseded
```

- `superseded` means the approved Seed changed before the builder completed.
- `unattested` means the repository changed after a recorded result.
- `needs_attention` includes failed scenarios, surface problems, coverage
  degradation, requirement regressions, and violated Seed v4 contracts.
- `ready` means the recorded change introduced no blocking regression and all
  required runtime/surface gates passed. It does not claim that every existing
  requirement is proven: pre-existing `cannot_verify` results remain visible.

## Evidence language

| Result | Meaning |
| --- | --- |
| `holds` | a matching Claim exists under the responsible analyzed coverage |
| `violated` | the expected Claim is absent or contradicted under analyzed coverage |
| `cannot_verify` | evidence or analyzer coverage is insufficient |
| `not_checkable` | the statement is intentionally recorded-only or outside the language |

Binding state is a separate axis: `resolved`, `ambiguous`, `stale`, or
`unbound`. A builder pointer is never allowed to turn a stale or ambiguous
binding into a hold.

Scenarios are examples, not universal proofs. A passing scenario says that one
bounded interaction ran and returned the asserted result. It does not establish
concurrency safety, atomicity, performance, or behavior for every input.

## Supported proof boundary

The strongest semantic proof is the constrained operational slice: React/Vite,
FastAPI, SQLAlchemy over PostgreSQL or SQLite, synchronous HTTP, local process
execution, and one configured builder. Varai also maps selected Next.js,
Prisma, Python, npm, Docker, and Compose structures.

The Signal proof application intentionally uses dependency-free Python stdlib
HTTP. Varai observes its four public surfaces and verifies its runtime
scenarios, while plain-Python resource/effect bindings remain
`cannot_verify`. That is an honest coverage boundary, not a reason to invent
static holds or to call the app unsupported.

## Readiness rules

A completed session blocks on:

- coverage moving from `analyzed` to a degraded state;
- a `holds` requirement regressing to `cannot_verify` or `violated`;
- missing, unaccounted, ambiguous, or stale expected surfaces;
- failed or unrun critical scenarios;
- violated state transitions or field contracts.

No LLM output, builder test, or human acknowledgement can erase one of these
reasons. Fix the application, change the approved Seed, or improve the
responsible analyzer/runtime capability.

## Deliberate non-goals

Varai does not currently provide a browser code editor, hosted repository
analysis, production deployment, arbitrary-stack readiness guarantees, a
model marketplace, general invariant or temporal-logic proving, concurrency or
atomicity proof, performance/SLA verification, or automatic recovery of human
intent from code.
