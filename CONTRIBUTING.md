# Contributing

Varai is early and example-driven.

The main rule:

> No abstract feature unless it improves a concrete audit scenario.

## Before Changing Code

Read:

- `docs/product.md`
- `docs/evidence-model.md`
- `docs/development.md`

Then choose or add a golden scenario under `examples/golden/`.

## Development Loop

1. Add or update a tiny scenario under `examples/golden/<name>/`.
2. Define expected statuses in `expected-findings.json`.
3. Improve scanner, matcher, or reporter behavior.
4. Run `npm test`.
5. Keep every finding evidence-backed or `unverified`.

## Commands

```bash
npm test
npm run audit:example
```

## Project Boundaries

- Local-first by default.
- No silent repo upload.
- No claim without evidence.
- No LLM feature before the deterministic evidence model is clear.
- Report usefulness comes before UI polish.
