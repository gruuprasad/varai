# ADR 0010: AI-assisted development roles share one authority loop

Status: Accepted
Date: 2026-08-01

## Decision

Varai exposes built-in development roles as lenses over the same approved Seed,
System Model, change, and verification evidence. The initial roles are Product,
Frontend, Backend, Architecture, AI Behavior, and Verification.

A role is a responsibility, not a person, permission, file boundary, agent, or
builder. One person may switch roles while working on one application. Each
role assistant receives a bounded projection plus the full current draft and
returns the existing complete Seed proposal shape. Human approval remains the
only way intent changes.

There is one builder packet and one deterministic verifier. Role views filter
shared evidence and may attach AI judgment, but they cannot set coverage,
verdicts, readiness, or ratification. AI and human assessments remain visibly
advisory or unverified.

Before a build, Varai derives a verification plan from Seed constructs. The
plan declares the checker method, required observability, coverage, and whether
the obligation blocks readiness. Exact bounded scenarios and their assertions
are transferred to the builder packet. After a build, role projections point
back to the same obligation and evidence IDs.

## Consequences

- Context switching happens at human intent level, not code ownership level.
- Role contributions remain ordinary Seed content; no second role or workflow
  IR is persisted.
- The verifier can explain what it can check before the builder runs and what it
  independently observed after the build.
- Dedicated per-role builders, parallel orchestration, custom role plugins,
  hosted providers, and new trace formats remain deferred until a concrete
  pilot shows the single loop is insufficient.

## Authority boundary

```text
human -> ratifies Seed
assistant -> proposes complete draft / advisory review
builder -> changes repository in a recorded session
verifier -> produces deterministic evidence and gate
role lens -> filters shared evidence; never overrides the gate
```
