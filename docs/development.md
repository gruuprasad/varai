# Development Discipline

Varai should be developed example-first.

The core rule:

> No abstract feature unless it improves a concrete audit scenario.

## Workflow

1. Write a small builder situation.
2. Turn it into a golden scenario under `examples/golden/`.
3. Add `intent.md`, a tiny app fixture, and `expected-findings.json`.
4. Improve scanners, matching, or reporting until the scenario passes.
5. Update product docs only when the behavior changes the contract.
6. Run tests.
7. Commit.

## Golden Scenario Shape

```text
examples/golden/<scenario>/
  intent.md
  expected-findings.json
  app/
```

The app fixture should be intentionally small. Prefer one clear failure mode over a realistic project.

## Definition Of Done

A change is done when:

- a fixture or unit test captures the behavior
- findings include evidence or say `unverified`
- the generated report is understandable
- `npm test` passes
- docs are updated only when the product contract changes

## Hard Rules

- No claim without evidence.
- No silent repo upload.
- No LLM feature before the evidence shape is clear.
- No new scanner unless a golden scenario needs it.
- No UI before reports are useful.
- If unsure, mark `unverified`.

## Product Bias

Varai is not trying to understand everything. It is trying to help a builder stay oriented after AI-assisted development has made the repo move faster than their mental model.
