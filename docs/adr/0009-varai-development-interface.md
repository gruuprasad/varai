# ADR 0009: Varai Is the Application-Development Interface

Status: Accepted

Implementation note (2026-08-01): The first end-to-end proof uses the local
Codex CLI with model `gpt-5.6-luna` for both the product assistant and managed
builder. The sibling Signal application is the current demonstration project;
its live AI behavior is evaluated separately from deterministic Varai runtime
scenarios.

## Context

ADR 0007 correctly constrained the first application class and substrate, but
described Varai as a control room surrounding an external AI-development
experience. The implemented product consequently split Seed chat, builder
messaging, preview, and verification into separate destinations.

The intended product boundary is stronger: a person should be able to create
and evolve an application without leaving Varai or operating primarily through
code, a terminal, raw builder chat, or hand-edited Varai JSON.

## Decision

Varai is the sole human operating surface for the supported application-
development loop:

```text
conversation -> reviewed Seed -> managed builder -> local application
             -> independent verification -> next conversation
```

One durable product conversation is the front door. It presents distinct
roles—product assistant, interchangeable builder, and independent verifier—
without merging their authority. Human approval remains required before a Seed
becomes executable intent. LLM output remains advisory and cannot set coverage,
verification verdicts, readiness, or ratification.

The Seed remains the durable product definition, the System Model remains the
only public persisted analyzer model, and build/session records remain audit
evidence. A unified interface is a projection over those authorities, not a
second product IR.

The first supported lifecycle boundary is conversation to a locally running,
independently checked application. The strongest semantic proof remains ADR
0007's constrained operational substrate; Signal also proves the workflow on a
small Python stdlib HTTP application while reporting its uncovered resource and
effect bindings honestly. A code editor, arbitrary stacks, hosting, and
production deployment remain deferred.

This supersedes ADR 0007 only where it says Varai is not a prompt-to-application
builder. Varai does orchestrate application development, while keeping the
builder interchangeable and verification independent.

## Consequences

Seed Studio, Build, Blueprint, and Verify remain useful evidence views, but the
primary product experience is the continuous Develop conversation. A prototype
is incomplete if a normal build or change requires the person to leave Varai,
edit JSON, message the builder elsewhere, or inspect code.

An AI agent may perform a scoped black-box reviewer role using Varai and the
application preview. Its recommendation is clearly advisory and cannot override
deterministic evidence or human approval.
