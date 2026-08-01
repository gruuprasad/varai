# Varai

Varai is a local application-development interface for software built with AI.
It keeps the person in one workflow from product idea to a running application:

```text
conversation → approved Seed → managed Codex build → independent evidence
             → ready / needs attention → next conversation
```

The human owns the product decision. The builder writes code. Varai observes
the repository and runs the checks. Those roles are deliberately separate.

Varai is a pre-release local prototype. It is useful for exploring the
workflow, not a claim of universal code correctness or framework coverage.

## Start here

Requirements: Node.js 20+ and the Codex CLI for AI-assisted authoring/builds.
The current default model is `gpt-5.6-luna`. Varai uses the local command; it
does not require an API platform or API key.

```bash
npm install -g .
varai create ../my-app
varai start ../my-app --no-open
```

Open the local dashboard. Use the Develop conversation to describe the app,
review the proposed Seed, approve it, and start the managed build. A generated
project contains a `varai.config.json` with the Codex assistant and builder
configuration.

To inspect an existing repository:

```bash
varai start ../repo --no-open
varai map ../repo
varai snapshot ../repo
varai diff ../repo
```

## The four roles

| Role | Job | Authority |
| --- | --- | --- |
| Human | describe, review, approve, change product intent | owns the Seed |
| Product assistant | clarify conversation and propose Seed JSON | advisory only |
| Builder | implement an approved Seed in a recorded session | writes code, never verdicts |
| Verifier | scan, reconcile, run scenarios, report evidence | sets deterministic evidence state |

The assistant and builder are separate command boundaries. Both default to
local Codex with `gpt-5.6-luna`; the boundary can be replaced later. Varai
never sends repository contents to a hosted service silently.

## The three durable authorities

1. **Seed** — `varai.seed.json`, human-ratified product intent: concepts,
   commitments, surfaces, scenarios, state models, field contracts, flows, and
   explicitly recorded context.
2. **System Model** — Varai's one canonical, evidence-backed observation of the
   repository. It contains Elements, Claims, evidence, and analyzer coverage.
3. **Build evidence** — session records, realization/runtime pointers, scenario
   results, interventions, and gate decisions.

`varai.realization.json` and `varai.runtime.json` are untrusted pointers. They
say what the builder believes should be checked; they do not establish that it
is correct. Reconciliation is computed from the Seed, pointers, System Model,
and coverage. Varai does not persist a second combined product IR.

## The commands that matter

```bash
# Product intent
varai seed validate <repo>
varai seed approve <repo>                 # alias: ratify
varai handoff <repo> --json

# Build lifecycle
varai build begin <repo>
varai build run <repo> --adapter codex
varai build message <repo> "product clarification"
varai build status <repo>
varai build stop <repo>

# Evidence and change
varai check <repo>
varai verify scenarios <repo> --json
varai realization lint <repo>/varai.realization.json <repo> --json
varai runtime derive <repo> --write --json
varai progression <repo> --from <session> --json
```

Use `--include`, `--exclude`, `--jobs`, `--no-cache`, and
`--parser native|wasm` with scan-based commands when a repository needs a
smaller or reproducible scope.

## How to read a result

Static and runtime evidence answer different questions:

| Evidence | Establishes | Does not establish by itself |
| --- | --- | --- |
| System Model | observed structure, effects, dependencies, public artifacts | runtime correctness or universal invariants |
| Runtime scenario | one bounded interaction and response | behavior for every input or concurrent execution |
| Realization/runtime map | where a check should look | that the implementation is correct |
| Builder message/test | supporting testimony | a verifier verdict |

Requirement verdicts are `holds`, `violated`, `cannot_verify`, and
`not_checkable`. Binding states are separate: `resolved`, `ambiguous`, `stale`,
and `unbound`. A missing claim is only a violation when the responsible
analyzer coverage is exact; otherwise Varai says it cannot verify.

The build gate compares the recorded build with its starting evidence. It
blocks on coverage degradation, requirement regressions, bad surfaces, failed
or unrun scenarios, and violated Seed v4 state/field contracts. A `ready`
session therefore means the recorded change introduced no blocking regression;
it does not turn every existing `cannot_verify` result into a proof.

## Proof application: Signal

The sibling project [varai-signal-pilot](../varai-signal-pilot/README.md)
demonstrates the workflow with a small AI-native knowledge feed. Contributions
become claims, summaries preserve traceable sources, and disagreement is kept
visible. The app uses the local Codex command with `gpt-5.6-luna`; its tests
inject a deterministic fake provider.

```bash
cd ../varai-signal-pilot
python3 -m unittest -v test_signal.py
python3 app.py                         # live local Codex
```

The Varai runtime map uses `app.py --fake` so its three scenarios are fast and
repeatable. A separate black-box live check covers the semantic sequence
`new → redundant → corroborating → conflicting` and confirms that a Codex
failure returns `503 cannot_verify` without changing stored claims.

## Current boundary

The strongest readiness proof is the constrained operational slice: React/Vite,
FastAPI, SQLAlchemy over PostgreSQL/SQLite, synchronous HTTP, local processes,
and one configured builder. Varai also maps selected Next.js, Prisma, Python,
npm, and Docker/Compose structures, plus the proof app's Python stdlib HTTP
surface. Mapping support is not the same as full semantic readiness coverage.

Unsupported or dynamic behavior is reported as `cannot_verify` or
`cannot_account`, never as a clean absence. Varai does not yet prove
concurrency, transaction atomicity, performance, temporal properties, general
program correctness, deployment, or hosted repository workflows.

## Documentation map

- [Documentation index](docs/README.md) — the shortest route through the docs.
- [Product control room](docs/product-control-room.md) — current product and
  trust contract.
- [Semantic language](docs/semantic-language.md) — normative Seed/System Model
  vocabulary.
- [Roadmap](docs/roadmap.md) — shipped, next, and deliberately deferred.
- [The Varai idea](docs/the-varai-idea.md) — exploratory rationale.
- [ADRs](docs/adr/) — accepted decisions and their history.
- [Historical pilots](docs/poc/) — adversarial evidence, not current product
  instructions.

## Development

```bash
npm test
```

The test suite is the local regression gate. Use a focused fixture and update
the relevant analyzer/version tests when adding scanner behavior.

## License

See [LICENSE](LICENSE).
