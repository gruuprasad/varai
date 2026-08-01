# Varai implementation contract

This document describes the stable implementation boundary. Product language
and meaning are normative in [semantic-language.md](semantic-language.md).

## Product pipeline

```text
repository
  → scoped scanners and analyzers
  → System Model v1
  → map / snapshot / diff / checks / reconciliation / explanation
```

The development workflow adds a separate, human-owned input and evidence path:

```text
Seed + builder session + runtime evidence
  → projections over the System Model
  → reconciliation, scenarios, progression, and build gate
```

Parser observations, framework traces, and builder packets are not a second
public product model.

## System Model

The model contains one System, registered Subsystems, stable Elements, typed
Claims, evidence, claim state, analyzer Coverage, and Diagnostics. Element and
Claim identity is semantic: source paths, line numbers, analyzer versions, and
confidence do not define identity. Framework names belong in analyzer details,
not kernel vocabulary.

Every Element/Claim reports:

- evidence location;
- observation method (`manifest`, `ast`, `semantic`, or `convention`);
- claim state (`observed`, `inferred`, `unverified`, or `ambiguous`);
- responsible analyzer coverage.

Coverage states are `analyzed`, `partial`, `unsupported`, and `failed`. Absence
is only a meaningful claim under `analyzed` coverage.

## Parser and cache contract

Parsing is behind `src/scanners/treesitter.js`. Native and WASM backends must
produce the same canonical model. Serial and worker scans, and cached and
uncached scans, must preserve canonical model parity.

Per-file observation cache entries include `EXTRACTOR_VERSION` from
`src/scanners/cache.js`; extraction changes must bump it. Rendering, diff, and
report-only changes do not need a bump.

## Seed and reconciliation contract

`varai.seed.json` is human-ratified source intent. It is not generated from the
repository and is not an analyzer IR. `varai.realization.json` and
`varai.runtime.json` are untrusted pointers naming where the builder believes
intent was implemented and exercised.

Reconciliation is a pure deterministic projection over:

```text
ratified Seed + realization/runtime pointers + System Model + coverage
```

It persists no combined graph and never calls an LLM. Binding state and
requirement verdict remain separate:

```text
binding:  unbound | resolved | ambiguous | stale
verdict:  holds | violated | cannot_verify | not_checkable
```

The build gate compares a completed recorded session with its starting model.
It blocks coverage degradation, requirement regressions, surface problems,
failed/unrun scenarios, and violated Seed v4 state/field contracts. Existing
`cannot_verify` results remain visible even when the change itself is ready.

## Snapshots and diffs

Snapshots store one content-addressed System Model object with its schema
version, Git state, scanned-tree hash, and scan-configuration hash. Diff
compares validated models and separates semantic changes from evidence movement.

## CLI surface

The supported command groups are:

- `create`, `start`;
- `map`, `snapshot`, `log`, `diff`, `progression`;
- `seed validate|approve|migrate`, `handoff`;
- `build begin|run|message|stop|close|status`;
- `check`, `realization lint`, `runtime derive`, `verify scenarios`.

Run `varai --help` for flags. The root README gives the shortest examples.

## Non-goals

The implementation does not promise exhaustive framework coverage, hosted
repository analysis, LLM-created findings, runtime correctness without runtime
evidence, deployment orchestration, general invariant proving, or intent
recovery from code.
