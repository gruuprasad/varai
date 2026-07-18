# Varai Glossary

Canonical terms for the product and codebase. `docs/semantic-language.md` is the normative language definition; `docs/spec.md` describes the implementation contract.

## System Model

The local, evidence-backed description Varai builds from a repository. It is the product object from which the map, progression, checks, and explanations are projected.

## System

The independently understandable software project being described. A repository normally maps to one System; future monorepo support may discover several.

## Subsystem

A coherent part of a System rendered through its own interaction language. Initial lenses include API, UI, Worker, CLI, Data, Service, Library, and Application.

## Element

A stable, referable system-level part inside a Subsystem. Examples include an operation, screen, action, job, command, entity, contract, workflow, or process.

## Interface

An Element role through which something outside a Subsystem can interact with it: endpoint, screen/control, queue, schedule, command, or service port.

## Behavior

An Element role representing something the System can do. Behaviors are the primary units users inspect and compare. Meaningful internal application logic is lifted only when it has a stable use-case, workflow, decision, orchestration, or state-effect boundary.

## Resource

An Element role for state, data, contracts, files, configuration, queues, or external systems that Behaviors read or affect.

## Claim

One atomic relationship from a source System/Subsystem/Element to a referenced Element or literal. Every Claim carries evidence, observation method, confidence state, and responsible analyzer capability.

## Evidence

The repository-relative location and optional symbol/manifest key grounding an Element or Claim. Evidence can move without changing semantic identity.

## Claim state

The honesty state of an Element or Claim: `observed`, `inferred`, `unverified`, or `ambiguous`.

## Coverage

What an analyzer capability could determine within a scope: `analyzed`, `partial`, `unsupported`, or `failed`. Coverage describes analyzer reach, not code quality or test coverage.

## Lens

A subsystem-specific vocabulary and presentation over the framework-neutral kernel. Framework names belong in adapter/evidence details, not lens or relationship vocabulary.

## Adapter

A deterministic translator from language/framework observations into System Model Elements, Claims, coverage records, and diagnostics.

## Fact

The smallest deterministic technical observation produced by existing extractors. Facts remain valuable evidence and drill-down data, but are not the primary product surface. During migration they live in Analysis IR v2 and feed the System Model compatibility projector.

## Stock pattern

A common recognizable implementation pattern such as auth, payments, or notifications, grounded in deterministic fact signatures. Stock patterns are an optional classification overlay, not domain intent and not part of semantic identity.

## Semantic progression

The structural difference between two System Models: Elements, Claims, qualifiers, evidence, confidence, coverage, and ambiguity changing across Git or explicit checkpoints.
