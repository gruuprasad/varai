# Architecture

For the canonical scope and contract, see [spec.md](spec.md). This document describes the pipeline shape.

Varai should be built as a small local pipeline.

```text
Intent source
  -> intent extractor
  -> structured requirements

Local repo
  -> deterministic scanners
  -> evidence facts

Requirements + facts
  -> evidence-constrained matcher
  -> findings

Findings
  -> markdown/html report
  -> next prompt
```

## Layers

### Intent Extractor

Reads a prompt, PRD, issue, chat transcript, or notes file and extracts requirements.

Early versions can be simple. Later versions can use an LLM, but the output must be structured and inspectable.

### Deterministic Scanners

Scanners extract grounded facts from the repo. These are the honesty substrate.

Initial scanners:

- Next.js pages and API routes
- `package.json` dependencies
- Prisma models
- Supabase migrations
- env var references
- simple code hints for auth, payments, email, notifications, permissions

Future scanners:

- Supabase RLS policies
- Stripe webhook completeness
- Auth guards and route protection
- tests and coverage signals
- background jobs
- storage and file upload paths

### Evidence-Constrained Matcher

Compares requirements to extracted facts in two layers (see spec section 6):

1. Capability profiles — for known failure modes, check that all required evidence links are present. Names the missing links when they are not.
2. Keyword fallback — conservative overlap for everything else; never emits `satisfied`.

A later LLM layer is allowed only on top of this deterministic path, and only using provided evidence. When evidence is weak, the matcher must return `unverified`, not invent certainty.

Statuses emitted today: `satisfied`, `partial`, `unverified`. Reserved for later: `missing`, `extra`.

### Reporters

The report is the product surface.

Start with Markdown. Add HTML once the evidence model is stable.

The report should always include:

- summary
- requirement coverage
- evidence links
- partial or unverified areas
- next prompt for the coding agent

## Design Constraint

Every claim should be traceable to one of:

- deterministic evidence
- inferred claim with cited evidence
- explicit uncertainty
