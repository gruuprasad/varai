# Varai Spec

This is the canonical description of what Varai does today and what it deliberately does not do yet. When behavior and this document disagree, fix one of them.

## 1. Problem

While building with AI, the repo moves faster than the builder's mental model. After several sessions you no longer know what exists, what is half-built, what was forgotten, or what to ask next.

Varai exists for that moment: orientation before the next AI pass.

## 2. Audit Type

Varai performs one kind of audit: an **Intent Coverage Audit**.

> Given what you said you wanted, what does the repo appear to contain, what is missing, and what is uncertain?

It is intentionally not:

- code review (correctness, style, bugs)
- security or vulnerability scanning
- test coverage measurement
- architecture or dependency diagrams
- a general "understand my codebase" Q&A tool

Those are valid tools. They are not this tool. Keeping the audit type singular is what keeps the report honest and the scope buildable.

## 3. Pipeline

```text
intent file
  -> requirements        (intent.js)

local repo
  -> facts               (scanners/repo.js)

requirements + facts
  -> findings            (matcher.js + capabilities.js)

findings
  -> report + next prompt (reporters/markdown.js)
```

Every stage output is a plain, inspectable object. No stage may invent data that a later stage then treats as ground truth.

## 4. Evidence Model

Three record types, defined in detail in `evidence-model.md`.

- **Fact**: extracted directly from a file. Has `kind`, `name`, `evidence: [{ file }]`. Facts may be incomplete but are never invented.
- **Requirement**: extracted from intent. Has `id`, `text`, `keywords`.
- **Finding**: one requirement compared to evidence. Has `requirementId`, `status`, `summary`, `evidence`, `missingLinks`.

## 5. Status Rules

A finding carries exactly one status.

- `satisfied` — every required evidence link for the requirement is present.
- `partial` — some required evidence exists; one or more links are missing (named in `missingLinks`).
- `unverified` — no direct local evidence found.

Reserved, not yet emitted:

- `missing` — a requirement with zero evidence where absence is itself a confident claim (today this is reported as `unverified`).
- `extra` — repo capability with no matching requirement.

Trust rule: no claim without evidence. When evidence is weak, the answer is `unverified`, never invented confidence.

## 6. Matcher Layers

The matcher tries the layers in order and returns the first that applies.

### 6a. Capability profiles (deterministic)

For requirements that name a known capability (payments, notifications, authentication, admin), the matcher resolves a **profile** describing the required evidence links, then checks each link against the facts.

- all links present -> `satisfied`
- some links present -> `partial`, with the missing links named
- no links present -> `unverified`, with the expected links listed

This is the layer that distinguishes "checkout UI exists" from "checkout UI exists but the webhook handler is missing."

### 6b. Keyword fallback (generic)

For requirements with no known capability, the matcher does conservative keyword overlap against facts.

- any overlap -> `partial`
- none -> `unverified`

The fallback never emits `satisfied`. Only a capability profile can prove completeness.

## 7. Check Packs

A check pack is the declarative definition behind a capability profile. It is the unit of contribution.

A capability defines:

- `terms`: words in a requirement that activate it
- `resolveProfile(text)`: picks a profile and its `required` evidence-link ids
- a set of **checks**, each a named predicate over a fact (`checkout_ui`, `webhook_handler`, ...)

A profile is a named failure mode plus the links that must all be present for it to be considered complete. Example:

```text
payments / webhook_confirmation
  required: [checkout_ui, webhook_handler]

payments / billing
  required: [checkout_ui, stripe_integration]
```

Golden scenarios under `examples/golden/` are the test corpus for check packs. Adding a real-world AI-build failure mode means adding a scenario and, if needed, a profile.

## 8. Report Contract

The Markdown report always includes:

- **Summary** — files scanned, facts found, requirement count
- **Intent Coverage** — one section per requirement: status, summary, missing links, evidence
- **Build Surface** — inventory of pages, API routes, models, integrations, signals. This is context, not audit. It carries no status.
- **Next Prompt** — a ready-to-paste prompt focused on `partial` and `unverified` requirements

## 9. Non-Goals (for now)

- domain structural lens (see section 11)
- LLM matcher (allowed later, only as an optional layer on top of the deterministic path, evidence-constrained, defaulting off)
- universal language support
- cloud-hosted repo ingestion
- autonomous code generation

## 10. Local-First Constraint

Varai runs locally and reads local files only. It must never upload a repo. It has zero runtime dependencies; the standard library is the dependency budget. Both are product promises, not implementation accidents.

## 11. Relationship to the Original Vision

Varai began as a broader idea: a **structural lens** that renders AI-built software in domain vocabulary so a non-coder can survey it like a map and spot wrong shapes without reading code. That vision had two navigation knobs (code <-> structure, static <-> projection) and treated the lens as an output derived from code, never an input to generation.

ADR 0001 narrowed that to a buildable wedge: a local, evidence-backed intent-coverage report. Varai v1 is the verification loop of the original vision without the domain lens.

The lens remains the long-term destination. Intent coverage with deterministic check packs is the vehicle that ships today and stays honest without an LLM. Anything that moves Varai toward domain-shaped legibility is in-direction; anything that asks the tool to invent confidence is out.

## 12. Planned Work

- ~~Matcher hardening: conservative keyword fallback (#2), capability collision scoring (#3)~~ **done**
- ~~Semantic intent extraction Tier A~~ **done** — see [plan-intent-extraction.md](plan-intent-extraction.md)
- Stdin intent (`--intent -`) — **done**
- Optional LLM intent extraction Tier B — not started
