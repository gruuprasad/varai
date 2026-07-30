# Varai

**A local product control room for software built by AI.**

When an AI can produce more code than a person can read, code and diffs stop
being a sufficient human operating surface. Varai lets a person describe and
approve the product in domain language, hand that approved specification to an
interchangeable AI builder, and independently check what was actually built.

```text
human conversation
  -> AI-assisted Seed draft
  -> human approval
  -> recorded AI build
  -> independent static and runtime evidence
  -> ready / needs attention + progression
```

Varai is local-first and pre-release. The current technical proof has completed
nine adversarial trials with zero false greens; evaluation with target users is
still pending. The binding model and the value of this workflow to real product
owners remain open questions, not solved claims.

## The problem

AI changes the economics of software production without changing the economics
of human comprehension. A person can state a product in conversation and an
agent can expand it into plans, code, tests, and explanations faster than that
person can read or retain the result.

Asking the builder to explain or review its own work does not close the trust
loop: the same probabilistic system becomes both builder and narrator. Domain
meaning is also difficult to recover from code after the fact. The same
conditional can enforce ownership, a financial limit, or an arbitrary UI rule.

Varai therefore captures meaning before implementation and separates three
authorities:

1. **Seed** — human-owned product intent, drafted with AI assistance and approved
   only by a person.
2. **System Model** — Varai's independent, evidence-backed observation of the
   repository.
3. **Build evidence** — recorded sessions, builder-provided pointers, scenario
   runs, and gate decisions. Builder testimony can guide a check but cannot set
   its result.

Varai never persists a combined intent-and-code graph. Reconciliation, surface
accounting, blueprints, and readiness are projections computed from these
separate authorities.

## The Seed language

`varai.seed.json` is not a generated requirements document or a mirror of the
code. It is a small domain-level source language for the product:

- **concepts** — actors, behaviors, resources, conditions, and outcomes;
- **commitments** — atomic relationships such as creates, reads, changes,
  requires, fails with, or depends on, with `present` or `absent` polarity;
- **surfaces** — the approved externally reachable UI, API, webhook, job, or CLI
  behavior;
- **scenarios** — bounded multi-step examples involving named product actors;
- **context** — important intent that Varai records without pretending it can
  verify it.

The dashboard's Seed Studio supports recoverable, multi-turn authoring. An
OpenAI-compatible assistant may ask clarifying questions and propose a complete
draft from the conversation and current Seed. It receives no repository code,
cannot write the Seed, and cannot approve anything. Unsupported statements stay
visible instead of disappearing into plausible prose. Approval freezes the
reviewed draft under a semantic content hash.

The Seed deliberately avoids routes, files, symbols, framework names, and other
implementation vocabulary. Those belong to realization bindings, not product
intent.

## Build and independent verification

An approved Seed becomes a vendor-neutral build packet. Varai can run an
explicitly configured local AI CLI through a replaceable process adapter and
records the exact Seed hash, repository state, builder events, messages,
interventions, and final verification result.

The builder emits two untrusted maps:

- `varai.realization.json` binds Seed concepts and expected surfaces to stable
  observed artifact boundaries;
- `varai.runtime.json` says where approved behaviors can be exercised and which
  configured personas to use.

These files are pointers, never proof. Varai independently scans the repository
and evaluates several complementary evidence planes:

- **System Model and semantic diff** — deterministic Elements, Claims,
  evidence, identity, coverage, snapshots, and progression;
- **ArchUnit-style architecture checks** — source dependencies become canonical
  `depends_on` Claims and roll up into module-grain architecture units. The
  current dependency extractor covers Python imports; this is the first fitness-
  function slice, not a general architecture-rule engine;
- **commitment reconciliation** — declared bindings are resolved against
  observed Claims and exact analyzer coverage;
- **surface accounting** — expected public behavior is checked in both
  directions, exposing both missing behavior and behavior nobody approved;
- **runtime scenarios** — Varai independently invokes bounded, ratified examples
  against a loopback application and checks status and partial response bodies;
- **coverage regression** — making code harder to analyze cannot quietly turn a
  violation into a harmless-looking unknown.

Requirement verdicts are `holds`, `violated`, `cannot_verify`, or
`not_checkable`. Binding state is reported separately as `resolved`,
`ambiguous`, `stale`, or `unbound`. A build is `ready` only when requirements,
critical scenarios, bindings, expected and observed surfaces, coverage, Seed
hash, repository state, and scan configuration all agree. There is no generic
green state that hides `cannot_verify`.

## What runs today

Varai requires Node 20+.

```bash
npm install -g .

varai start ../repo                  # local product control room
varai map ../repo                    # current evidence-backed System Model
varai snapshot ../repo               # Git-bound checkpoint
varai diff ../repo                   # semantic change since a checkpoint

varai seed validate ../repo
varai seed approve ../repo           # human approval; alias: ratify
varai handoff ../repo                # render the approved builder packet

varai build begin ../repo
varai build run ../repo --adapter <configured-id>
varai build status ../repo
varai check ../repo
varai progression ../repo --from <session> --to <session>
varai verify scenarios ../repo
```

Use `varai start` for the current Change → Blueprint → Build → Verify workflow.
Use `--include <prefix>` and `--exclude <prefix>` to constrain scans, and
`--parser native|wasm` to select a parser backend.

## Current scope

The product proof is intentionally constrained to multi-role operational web
software—approvals, bookings, case management, resource allocation, and similar
stateful workflows—on this substrate:

- React/Vite;
- FastAPI;
- SQLAlchemy with PostgreSQL or SQLite;
- synchronous HTTP commands and queries;
- local process execution and one configured AI-builder subprocess.

The underlying repository observer also recognizes selected Next.js, Prisma,
npm/Python command, and Docker/Compose structures. That broader mapping support
does **not** imply that the full readiness contract is proven on those stacks.
Unsupported or dynamic behavior reports `cannot_verify` or `cannot_account`; it
never becomes a clean absence.

## What the evidence means

| Evidence | Can establish | Cannot establish alone |
| --- | --- | --- |
| Static System Model | routes, effects, dependencies, public artifacts | runtime authorization, atomicity |
| Runtime scenario | one concrete interaction and observed result | a universal invariant |
| Realization/runtime map | where to check | correctness |
| Builder prose and tests | supporting testimony | a verdict |

Scenarios are examples, not proofs over every possible input. Varai does not yet
prove concurrency, transaction atomicity, temporal properties, performance, or
general program correctness.

## What has been tested—and what has not

The purchase-approval proof application has been exercised against nine
adversarial cases: a green build, omitted audit write, inverted authorization,
state corruption after denial, an unexpected destructive route, analyzer-
coverage poisoning, a pure refactor, an approved product change, and an edit
outside the recorded session.

The technical trial produced the expected state in all nine cases with zero
false greens. That establishes the behavior of this constrained proof, not the
general Varai thesis. Five-user human evaluation is still pending, so the
product release gate has not passed.

The largest unresolved issue remains binding: reconciliation is deterministic
once a builder declares where a Seed concept was realized, but whether those
bindings remain honest, complete, and maintainable on real evolving systems is
not proven. Varai is published to expose that question to criticism, not to hide
it behind a finished-product claim.

This repository itself has been developed with extensive AI coding assistance.
That is part of the motivation for making every claim earn its authority through
evidence, coverage, adversarial tests, and explicit limits rather than through
the builder's confidence.

## Learn more

- **[Product control room](docs/product-control-room.md)** — the current product
  contract, audience, substrate, evidence limits, and readiness rules.
- **[Semantic language](docs/semantic-language.md)** — the normative vocabulary
  shared by Seeds and observed System Models.
- **[Purchase-approval trial results](docs/poc/purchase-approvals-trial-results.md)**
  — the technical adversarial proof and pending human gate.
- **[The Varai idea](docs/the-varai-idea.md)** — the longer argument and the
  unresolved binding problem.
- **[Specification](docs/spec.md)** and **[glossary](docs/glossary.md)** — the
  running tool's contract and canonical terms.
- **[Architecture decisions](docs/adr/)** — accepted product and trust-model
  decisions.

## Development

```bash
npm test
```

The Node test suite is the release gate and exits non-zero on any failure. No
documented claim about Varai's behavior should outrun its tests and recorded
trials.

## License

See [LICENSE](LICENSE).
