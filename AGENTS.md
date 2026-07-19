# Repository Guidelines

## Product shape

Varai is a local Node CLI that translates repository evidence into one canonical, versioned System Model:

```text
repository -> parsers/analyzers -> System Model -> map/diff/checks/explanation
```

Parser observations and framework-specific traces are private analyzer details. Do not expose, persist, or version a second product IR beside the System Model.

## Project structure

`bin/varai.js` owns CLI parsing. Scanning lives in `src/scanners/`; the framework-neutral kernel, identity, validation, coverage, and diff live in `src/system-model/`; snapshots live in `src/snapshots/`; renderers live in `src/reporters/`; the dashboard lives in `src/server/` and `src/ui/`. Product decisions are in `docs/adr/`; `docs/semantic-language.md` is normative.

## Development

- `node ./bin/varai.js map [repo]` renders the current System Model.
- `node ./bin/varai.js snapshot [repo]` stores a Git-bound checkpoint.
- `node ./bin/varai.js diff [repo]` compares a checkpoint with the current model.
- `node ./bin/varai.js start [repo] --no-open` starts the dashboard.
- `npm test` runs Node's built-in test runner.

Use ECMAScript modules and Node built-ins unless a dependency is justified. Keep the System Model plain JSON. Framework names belong in analyzers and evidence details, not kernel vocabulary or semantic identity.

## Parser backends and cache

Parsing is behind `src/scanners/treesitter.js`. Native and WASM backends must satisfy the same node-shape contract and produce identical canonical models. Select with `--parser native|wasm` or `VARAI_PARSER`.

The per-file observation cache keys on `EXTRACTOR_VERSION` in `src/scanners/cache.js`. Bump it whenever extraction logic changes. Model-only rendering or diff changes do not require a bump.

## Testing and principles

Prefer a small concept fixture plus focused analyzer/model/diff tests. For every new analyzer capability, test canonical model output, coverage, evidence, and a meaningful before/after diff. Preserve serial/worker and native/WASM parity.

Varai is local-first. Never add silent repository upload. Every user-facing statement must be a deterministic observation, an evidence-backed inference, or explicitly unverified/ambiguous. Absence claims require declared analyzer coverage.
