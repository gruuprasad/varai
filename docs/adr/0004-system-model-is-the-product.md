# ADR 0004: The System Model Is the Product

Status: Accepted

## Context

Varai began as an evidence report and later added a concept-level diff over facts and framework-shaped behavior cards. Dogfooding showed that neither a flat inventory nor a diff alone answers the user's main question: “What system exists here, at a level I can reason about without reading all the code?”

AST facts, Git boundaries, and optional language models are useful mechanisms, but none is the product boundary.

## Decision

Varai's product is a local, deterministic, evidence-backed System Model of a repository.

The model uses a framework-neutral semantic kernel of Systems, Subsystems, Elements, Claims, evidence, claim state, and analyzer coverage. API, UI, Worker, CLI, Data, Service, Library, Application, and future subsystem lenses translate the same kernel into familiar system language.

Current-system maps, semantic progression, checks, intent reconciliation, and optional English explanation are projections over the model.

Analysis remains local-first. An optional LLM may interpret already-proven model claims, but it does not discover or authorize claims and is never required for deterministic output.

During migration, Analysis IR v2 remains a compatibility payload for existing snapshot and diff surfaces. The System Model is introduced beside it rather than by reinterpreting historical objects.

## Consequences

- New framework support belongs in adapters, not in the kernel, differ, or persistence format.
- Stable semantic identity is independent of source location when an externally meaningful boundary exists.
- Coverage is part of the product model; unsupported analysis cannot be rendered as absence.
- Kalakar remains the first serious acceptance project but cannot define core vocabulary.
- Git supplies neutral checkpoints; semantic diff becomes an operation over two System Models.
- The map becomes the current-system projection rather than a fact inventory.

## Relationship to earlier decisions

This ADR supersedes ADR 0001's intent-report product shape and ADR 0003's statement that concept-level diff is itself the wedge product. It preserves their accepted constraints: local-first operation, evidence and uncertainty, vendor neutrality, Git-based boundaries, and real-project dogfooding.
