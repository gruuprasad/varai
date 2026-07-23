# Varai Glossary

Canonical terms for the product and codebase. `docs/semantic-language.md` is normative; `docs/spec.md` defines the implementation contract.

## System Model

The one canonical, versioned, evidence-backed description Varai builds from a repository. Map, progression, checks, and explanations are projections over it.

## System

The independently understandable software project being described. A repository currently maps to one System.

## Subsystem

A coherent part of a System rendered through its own interaction language. Initial lenses include API, UI, Worker, CLI, Data, Service, Library, and Application.

## Element

A stable, referable system-level part inside a Subsystem: an operation, screen, action, job, command, entity, contract, workflow, or process.

## Interface

An Element role through which something outside a Subsystem can interact with it: endpoint, screen/control, queue, schedule, command, or service port.

## Behavior

An Element role representing something the System can do. Internal application logic is lifted only when it has a stable use-case, workflow, decision, orchestration, or state-effect boundary.

## Resource

An Element role for state, data, contracts, files, configuration, queues, or external systems that Behaviors read or affect.

## Claim

One atomic relationship from a source System, Subsystem, or Element to a referenced Element or literal. Every Claim carries evidence, observation method, confidence state, and analyzer capability.

## Evidence

The repository-relative location and optional symbol or manifest key grounding an Element or Claim. Evidence can move without changing semantic identity.

## Claim state

The honesty state of an Element or Claim: `observed`, `inferred`, `unverified`, or `ambiguous`.

## Coverage

What an analyzer capability could determine within a scope: `analyzed`, `partial`, `unsupported`, or `failed`. Coverage describes analyzer reach, not code quality or test coverage.

## Lens

A subsystem-specific vocabulary and presentation over the framework-neutral kernel. Framework names belong in analyzer/evidence details, not lens or relationship vocabulary.

## Analyzer

A deterministic translator from language/framework syntax and manifests into System Model Elements, Claims, coverage records, and diagnostics.

## Observation

A private, framework-shaped parser result used while building the System Model. Observations may be cached for performance but are not a second product model, snapshot payload, or public API.

## Semantic progression

The structural difference between two System Models: Elements, Claims, qualifiers, evidence, confidence, coverage, and ambiguity changing across Git or explicit checkpoints.

## Seed

The human-ratified statement of source intent for a system (`varai.seed.json`): stable concepts and checkable commitments in the kernel relation vocabulary. A seed is a source program, not an analyzer model.

## Commitment

One atomic authored statement in a seed: a source concept, a kernel relation, and a concept or literal target. Commitments are declared by a person; Claims are observed from evidence. The two meet only in reconciliation.

## Realization witness

The builder's testimony (`varai.realization.json`) naming the seed hash it was built against and binding seed concepts to observed artifact boundaries. A witness is untrusted provenance, never a verdict.

## Reconciliation

The deterministic projection that checks ratified commitments against canonical Claims and coverage, reporting binding state (`unbound`, `resolved`, `ambiguous`, `stale`) separately from verdict (`holds`, `violated`, `cannot_verify`, `not_checkable`). Reconciliation mutates nothing and persists no combined graph.
