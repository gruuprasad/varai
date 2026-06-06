# Repository Guidelines

## Project Structure & Module Organization

Varai is a lean Node CLI with a small, justified dependency set (`ignore` for `.gitignore` handling and tree-sitter bindings for parsing). `bin/varai.js` parses commands and delegates to `src/index.js`. Core pipeline modules live under `src/`: `intent.js` extracts rough requirements, `scanners/repo.js` gathers local evidence, `matcher.js` compares requirements to evidence conservatively, and `reporters/markdown.js` renders the report. Product direction and architectural decisions live in `docs/`; golden audit scenarios live under `examples/golden/`.

## Build, Test, and Development Commands

- `node ./bin/varai.js audit --intent ./examples/golden/todo-partial/intent.md --repo ./examples/golden/todo-partial/app --out ./.varai/report.md` runs the CLI locally.
- `npm run audit:example` runs the same example through the package script.
- `npm test` runs Node's built-in test runner. Add tests under `test/` using `node:test`.

## Coding Style & Naming Conventions

Use ECMAScript modules and Node built-ins unless a dependency is clearly justified. Keep scanner output plain JSON-like objects with `kind`, `name`, and `evidence` fields so reports and matchers can share the same evidence model. Prefer conservative statuses over confident inference when evidence is weak.

### Parser backend

Parsing runs through a swappable backend behind `src/scanners/treesitter.js` (`parseTree` / `queryTree` / `loadLanguage`). Two backends exist:

- **native** (default): `tree-sitter` with native grammar bindings (`tree-sitter-python`, `-typescript`, `-javascript`, `-toml`). Fastest; requires a `node-gyp` toolchain at install time and is ABI-bound to the Node version.
- **wasm** (fallback): `web-tree-sitter` + `tree-sitter-wasms`. No native build; portable. Used automatically when the native backend fails to load.

Native bindings are an accepted, justified exception to the "built-ins first" rule because parse throughput is the tool's dominant cost. Select with `--parser native|wasm` or `VARAI_PARSER`. Keep the wasm backend working as a fallback — both must satisfy the node-shape contract extractors rely on (`childForFieldName`, `namedChildren`, `startPosition.row`, `.text`, `.type`).

### Cache invalidation

The per-file fact cache (`.varai/cache/`) keys on a `EXTRACTOR_VERSION` constant in `src/scanners/cache.js`. **Bump it in the same commit whenever you change extractor logic**, or stale facts will be served from cache.

## Testing Guidelines

Golden scenario tests live in `test/golden.test.js` and compare `examples/golden/*/expected-findings.json` to actual audit output. When adding behavior, prefer a small golden scenario first, then focused unit tests for extraction, scanning, matching, or report rendering.

## Project Principles

Varai is local-first. Do not add silent repo upload behavior. Every user-facing claim should be grounded in deterministic evidence, an evidence-cited inference, or an explicit `unverified` state. Report-first is the current direction; do not prioritize diagrams before the evidence model is stable.
