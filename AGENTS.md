# Repository Guidelines

## Project Structure & Module Organization

Varai is a dependency-free Node CLI. `bin/varai.js` parses commands and delegates to `src/index.js`. Core pipeline modules live under `src/`: `intent.js` extracts rough requirements, `scanners/repo.js` gathers local evidence, `matcher.js` compares requirements to evidence conservatively, and `reporters/markdown.js` renders the report. Product direction and architectural decisions live in `docs/`; `examples/intent.md` is the smoke-test input.

## Build, Test, and Development Commands

- `node ./bin/varai.js audit --intent ./examples/intent.md --repo . --out ./.varai/report.md` runs the CLI locally.
- `npm run audit:example` runs the same example through the package script.
- `npm test` runs Node's built-in test runner. Add tests under `test/` using `node:test`.

## Coding Style & Naming Conventions

Use ECMAScript modules and Node built-ins unless a dependency is clearly justified. Keep scanner output plain JSON-like objects with `kind`, `name`, and `evidence` fields so reports and matchers can share the same evidence model. Prefer conservative statuses over confident inference when evidence is weak.

## Testing Guidelines

There are no tests yet. When adding behavior, prefer small unit tests for extraction, scanning, matching, and report rendering. Keep fixtures minimal and local to the test that needs them.

## Project Principles

Varai is local-first. Do not add silent repo upload behavior. Every user-facing claim should be grounded in deterministic evidence, an evidence-cited inference, or an explicit `unverified` state. Report-first is the current direction; do not prioritize diagrams before the evidence model is stable.
