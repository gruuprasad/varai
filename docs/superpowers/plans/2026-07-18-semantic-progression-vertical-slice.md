# Semantic Progression — Implementation Plan

> **For agentic workers:** Execute this plan gate by gate. Do not start a later gate until the current gate's acceptance checks pass. Use failing tests first for correctness fixes and semantic regressions.

**Goal:** Deliver Varai's first trustworthy “Git for semantic progression” vertical slice: a deterministic, versioned semantic analysis; snapshots tied to Git state; and a behavior-level diff that tells a developer what to inspect and manually test after a code change.

**Architecture:** Repository analyzers produce a canonical Analysis IR. Content-addressed semantic objects persist that IR, snapshot manifests tie objects to Git/worktree state, and a pure differ compares stable behavior, state, clause, pattern, fact, diagnostic, and intent-artifact identities. Markdown and the dashboard are projections over the same diff. Semantic evaluation blocks confidently false claims from reaching snapshots.

**Tech stack:** Node.js ESM, Node built-ins, tree-sitter native/WASM adapters, `ignore`, `node:test`.

**Baseline:** 182 tests passing on 2026-07-18. The current product exposes `map` and `start`; no snapshot or diff implementation exists.

---

## Product decision

Varai rides on Git; it does not replace version control.

| Git concept | Varai concept |
|---|---|
| Working tree | Current semantic analysis |
| Blob/tree object | Canonical semantic object |
| Commit/ref | Semantic snapshot tied to Git state |
| `git diff` | Behavior/state/clause diff |
| `git log` | Semantic progression timeline |
| Hook/watch event | Automatic clean-commit snapshot |

The primary user-facing diff level is **behavior plus state relationships**. Facts remain the evidence atoms underneath. Bundles are derived views, not stable identities.

The first useful loop is:

```text
prompt / plan
  -> code change
  -> current semantic analysis
  -> diff against the semantic snapshot for HEAD
  -> targeted manual app check
  -> next steering prompt
```

---

## Non-goals for this plan

- No general call graph or SCIP integration.
- No LLM-generated semantic claims or names.
- No intent DSL or fuzzy requirement coverage.
- No automatic rename guessing in v1.
- No hosted snapshot storage.
- No frontend/worker behavior parity before backend diff proves useful.
- No checks or paste-ready steering output until the diff is dogfooded.

---

## Gate 0 — Deterministic scanner foundation

### Why this gate exists

Semantic history is worthless if two supported execution modes produce different analyses. Today serial scanning has seven extractor registrations while worker execution knows only five; forced worker scans lose schema facts and therefore behavior inputs/outputs. Worker lifecycle and JSON stock configuration also have confirmed correctness defects.

### Files

- Create: `src/scanners/extractor-registry.js`
- Modify: `src/scanners/index.js`
- Modify: `src/scanners/worker.js`
- Modify: `src/scanners/pool.js`
- Modify: `src/scanners/cache.js`
- Modify: `src/scanners/config.js`
- Modify: `src/scanners/extractors/stock-catalog.js`
- Add: `test/scanner-parity.test.js`
- Modify: `test/scanner-config.test.js`
- Modify: `test/extractors/stock-catalog.test.js`

### Tasks

- [ ] Give every extractor a unique stable ID; `python-common` and `schema` must not share one.
- [ ] Make serial execution, worker execution, stack selection, cache identity, and tests consume the same registry.
- [ ] Include an active-extractor fingerprint in the fact-cache key.
- [ ] Terminate workers after result or failure; cover worker exit in tests.
- [ ] Ensure serial fallback uses the same registry instead of another local map.
- [ ] Define a JSON-safe stock regex shape such as `{ "pattern": "audit", "flags": "i" }` and compile it in the configuration module.
- [ ] Return validated, compiled repository configuration from `loadRepoConfig`.
- [ ] Stop silently replacing malformed configuration with `{}`; return or throw a precise configuration diagnostic.
- [ ] Put behavior-trace failures into `scan.diagnostics` instead of silently returning an empty behavior view after stderr output.

### Acceptance

- [ ] The same fixture scanned with `jobs: 1` and `jobs: 4` has byte-equivalent canonical facts and behaviors.
- [ ] Schema and runnable facts survive worker mode.
- [ ] A forced worker scan exits promptly.
- [ ] Valid JSON stock extensions compile and match.
- [ ] Invalid config reports the exact field and reason.
- [ ] `npm test` passes.

**Stop condition:** Do not implement persisted semantic objects until serial/worker parity passes.

---

## Gate 1 — Versioned Analysis IR and semantic evaluation

### Why this gate exists

The current facts, stock instances, behaviors, constructs, and findings do not share stable identity or one honesty model. All 182 tests can pass while the full Kalakar output makes confidently wrong semantic claims. The diff must not fossilize those claims.

### Files

- Create: `src/ir/version.js`
- Create: `src/ir/identity.js`
- Create: `src/ir/canonicalize.js`
- Create: `src/ir/validate.js`
- Modify: `src/scanners/index.js`
- Modify: `src/scanners/utils.js`
- Modify: `src/scanners/behaviors/index.js`
- Modify: `src/scanners/extractors/stock-tagger.js`
- Create: `test/semantic/analysis-ir.test.js`
- Create: `test/semantic/identity.test.js`
- Create: `test/semantic/evaluation.test.js`
- Create: `test/fixtures/semantic-app/`
- Create: `test/fixtures/semantic-app.expected.json`

### Analysis IR v1

The canonical analysis contains:

```text
schemaVersion
analyzerVersion
scanContext
  active extractor IDs
  include/exclude scope
  stack set
facts[]
patternInstances[]
behaviors[]
stateLocations[]
bundleViews[]
diagnostics[]
intentArtifacts[]
```

Repository absolute paths, scan timestamps, and parser implementation details must not affect semantic identity.

### Stable identity rules

- **Behavior:** door type + HTTP method + resolved path.
- **Clause:** clause kind + normalized semantic payload; evidence is excluded.
- **State location:** medium + canonical target.
- **Fact:** kind-specific identity. Do not use one generic `kind:name` rule.
- **Bundle:** derived projection only; it has no durable identity in v1.
- **Evidence:** changes can be reported as moves without changing semantic identity.

V1 deliberately treats an HTTP-path rename as behavior removed + behavior added. Rename inference is deferred.

### Claim honesty

Keep observation method separate from claim state:

- Observation method: `ast`, `semantic`, `heuristic`, `file`.
- Claim state: `observed`, `inferred`, `unverified`, `ambiguous`.

Absence of a detected write must not imply read-only when effect coverage is incomplete.

### Semantic evaluation

Evaluation manifests support:

- Expected claims.
- Forbidden claims.
- Expected uncertainty.
- Source-role classification: production, test, generated, migration.
- Coverage/unsupported diagnostics.

Initial forbidden claims must cover known failure modes such as:

- An auth-signup bundle whose subject is `password-hash`.
- A ceremony claimed across routes that do not actually perform the mutation ceremony.
- Test-only routes presented as production behavior.
- Evidence-free claims created from a name match alone.

### Tasks

- [ ] Normalize fact and clause evidence into one documented shape.
- [ ] Replace `dedupeFacts` with kind-specific identity and evidence merging.
- [ ] Preserve stock pattern instances and roles in the IR; do not discard the `instances` result.
- [ ] Assign stable IDs after extraction and before rendering/persistence.
- [ ] Canonically sort objects and object fields before hashing/serialization.
- [ ] Validate Analysis IR at the scanner seam.
- [ ] Add expected/forbidden semantic evaluation helpers and fixtures.
- [ ] Keep existing inventory and behavior renderers working as projections over Analysis IR.

### Acceptance

- [ ] Identical repository content produces byte-identical canonical Analysis IR.
- [ ] Same-kind/same-name facts in distinct semantic locations do not erase each other.
- [ ] Repeated evidence for the same semantic fact is merged deterministically.
- [ ] Moving a handler file without changing its door or clauses changes evidence only.
- [ ] Forbidden semantic claims fail the suite.
- [ ] `npm test` passes.

**Stop condition:** Do not expose a user-facing concept diff while forbidden semantic claims pass unnoticed.

---

## Gate 2 — Targeted behavior/state deepening

### Why this gate exists

Behavior is the correct user-facing construct, but current subject, effect, ceremony, and bundle derivation depends too heavily on names, first-call identity, and URL prefixes. Deepen only the paths demanded by the semantic corpus; do not build a speculative general call graph.

### Files

- Create: `src/scanners/behaviors/symbol-index.js`
- Create: `src/scanners/behaviors/effects.js`
- Modify: `src/scanners/behaviors/resolver.js`
- Modify: `src/scanners/behaviors/body.js`
- Modify: `src/scanners/behaviors/constructs.js`
- Modify: `src/scanners/behaviors/clustering.js`
- Modify: `src/reporters/behaviors-section.js`
- Modify: `docs/kalakar-acceptance-checklist.md`
- Add/modify focused tests under `test/behaviors/`

### Tasks

- [ ] Build one reusable symbol index per scan instead of resolving imports independently for every behavior.
- [ ] Support local definitions, direct imports, aliases, and targeted package re-exports used by the dogfood corpus.
- [ ] Resolve calls under an explicit work budget; unresolved calls remain visible.
- [ ] Make database/file effects adapter-driven and type/context-aware instead of name-only.
- [ ] Recover state locations before deriving subjects and bundle views.
- [ ] Derive bundle views from shared state, gates, and evidenced behavior relations.
- [ ] Require sufficient evidence before deriving a subject or ceremony; otherwise emit `unverified`.
- [ ] Filter language/runtime built-ins from untraced-call noise without hiding meaningful unknown calls.
- [ ] Turn the Kalakar checklist into an executable dogfood command while retaining plain-language notes.

### Acceptance

- [ ] The five core behavior fixtures remain correct: login, quantities, render, elevation, sheet export.
- [ ] Subject, derived-data, ceremony, and job-scoping checks include expected and forbidden assertions.
- [ ] Ordinary built-ins do not inflate untraced density.
- [ ] Unsupported calls remain explicit.
- [ ] No unjustified mega-bundle ceremony claim is emitted.
- [ ] The generated Kalakar behavior view is navigable enough to identify a targeted manual app check.
- [ ] `npm test` passes.

---

## Gate 3 — Content-addressed semantic objects and snapshots

### Files

- Create: `src/snapshots/git-state.js`
- Create: `src/snapshots/store.js`
- Create: `src/snapshots/snapshot.js`
- Create: `src/snapshots/selectors.js`
- Create: `test/snapshots/store.test.js`
- Create: `test/snapshots/git-state.test.js`
- Create: `test/snapshots/selectors.test.js`
- Modify: `bin/varai.js`
- Modify: `.gitignore` only if current `.varai/` coverage is insufficient

### Storage layout

```text
.varai/
  objects/<first-two-hash-chars>/<semantic-hash>.json
  snapshots/<snapshot-id>.json
  refs/commits/<git-sha>.json
```

The content-addressed semantic object contains canonical Analysis IR. A snapshot manifest contains:

```text
snapshot format version
semantic object hash
git HEAD
clean/dirty state
scanned-tree hash
scan-config hash
intent-artifact hashes
creation metadata
```

Creation time belongs in the manifest, not in the content-addressed semantic object.

### Commands

```text
varai snapshot [repo]
varai log [repo]
```

### Tasks

- [ ] Read Git HEAD and clean/dirty state without mutating the repository.
- [ ] Compute a scanned-tree hash from included source content plus compiled scan configuration.
- [ ] Hash canonical Analysis IR with SHA-256 and reuse an existing object when content is identical.
- [ ] Persist snapshot manifests atomically.
- [ ] Maintain commit refs without allowing dirty snapshots to overwrite clean commit refs.
- [ ] Record configured intent-artifact paths and content hashes without parsing/binding them yet.
- [ ] Resolve selectors for snapshot ID, semantic object hash, commit SHA, `current`, and `last` where unambiguous.
- [ ] Keep snapshot format version separate from Analysis IR schema version.

### Acceptance

- [ ] Identical semantic analyses reuse one object.
- [ ] Dirty and clean states with the same HEAD remain distinct.
- [ ] Scan-configuration mismatches are recorded and cannot be compared silently.
- [ ] Snapshot writes are atomic.
- [ ] Missing or ambiguous selectors produce explicit errors.
- [ ] `varai log` lists semantic snapshots in deterministic order.
- [ ] `npm test` passes.

---

## Gate 4 — Semantic diff CLI

### Files

- Create: `src/diff/index.js`
- Create: `src/diff/facts.js`
- Create: `src/diff/behaviors.js`
- Create: `src/diff/summary.js`
- Create: `src/reporters/diff-markdown.js`
- Create: `test/diff/behaviors.test.js`
- Create: `test/diff/facts.test.js`
- Create: `test/diff/golden.test.js`
- Create: `examples/golden/semantic-diff/`
- Modify: `bin/varai.js`

### Commands

```text
varai diff
varai diff --from <snapshot-or-ref> --to <snapshot-or-ref>
varai diff --json
```

Bare `varai diff` compares the current Analysis IR with the stored clean snapshot for the current HEAD. If no valid baseline exists, it must explain how to create one; it must not choose an unrelated snapshot silently.

### Diff levels and rendering order

1. Behavior contract changes.
2. State read/write changes.
3. Gate and claim-state regressions.
4. Bundle-view membership changes.
5. Stock-pattern instance changes.
6. Supporting fact/evidence changes.
7. Intent-artifact changes.

Clause changes include:

- `requires` added/removed.
- `takes`/`gives` changed.
- `reads`/`writes` added/removed.
- Failure modes added/removed.
- `observed`/`inferred` becoming `unverified` or `ambiguous`.

Evidence-only movement is rendered as moved evidence, not semantic behavior change.

### Target demonstration

```text
~ POST /api/v1/projects
  + needs get_current_user
  + stores db (Project)
  return ProjectDraft -> ProjectResponse
  evidence: services/backend/routes/projects.py:...
```

### Tasks

- [ ] Implement the differ as a pure function over two validated Analysis IR objects.
- [ ] Compare stable IDs first and normalized semantic payloads second.
- [ ] Keep renderer concerns out of diff classification.
- [ ] Put confidence regressions and newly introduced writes near the top.
- [ ] Render evidence next to every changed claim.
- [ ] Provide equivalent JSON and Markdown representations.
- [ ] Warn on analyzer-version differences; reject incompatible schema versions.
- [ ] Treat v1 door/path renames explicitly as remove + add.

### Acceptance

- [ ] Adding a database write is prominent.
- [ ] Removing an auth gate is prominent.
- [ ] Changing an input/output schema is a clause change.
- [ ] Moving a handler file is evidence movement only.
- [ ] A claim becoming unverified is prominent.
- [ ] Identical objects produce an empty semantic diff.
- [ ] JSON and Markdown contain the same classified changes.
- [ ] Golden diff output is deterministic.
- [ ] `npm test` passes.

---

## Gate 5 — Progression dashboard and dogfood release gate

### Files

- Modify: `src/server/index.js`
- Modify: `src/server/watcher.js`
- Modify: `src/ui/app.js`
- Modify: `src/ui/index.html`
- Modify: `src/ui/styles.css`
- Add server/UI tests where feasible

### Product surface

- Snapshot timeline.
- Current-versus-baseline semantic summary.
- Behavior diff as the primary view.
- Expandable supporting evidence and diagnostics.
- Map retained as a secondary current-state view.
- Automatic snapshot when a new clean HEAD is observed.
- Live dirty diff updates without persisting every keystroke.

### Tasks

- [ ] Add snapshot-list and diff HTTP endpoints.
- [ ] Broadcast scan and semantic-diff events separately over SSE.
- [ ] Render behavior/bundle changes before flat fact inventory.
- [ ] Link every changed claim to its source evidence.
- [ ] Show unsupported/ambiguous analysis visibly.
- [ ] Detect HEAD transitions and persist clean semantic snapshots.
- [ ] Never persist watcher cache writes as semantic changes.
- [ ] Preserve `varai map` and the current fact browser as secondary views.

### Release acceptance

- [ ] Use the feature during real Kalakar development.
- [ ] A diff identifies at least one concrete manual app check that would not have been chosen from `git diff` alone.
- [ ] Record every false, missing, or noisy claim as an executable semantic evaluation case.
- [ ] A real diff changes a next-prompt or manual-testing decision, satisfying ADR 0003's dogfood rule.
- [ ] CLI and dashboard agree on the same semantic changes.
- [ ] `npm test` passes.

---

## After this vertical slice

### Legacy intent matcher disposition

After semantic diff is in daily use:

- Remove `src/intent.js`, `src/matcher.js`, and `src/capabilities.js` rather than reviving their fuzzy profile matcher.
- Remove or repurpose their isolated tests and `examples/golden/*/expected-findings.json` fixtures.
- Build a new intent-artifact overlay over stable semantic identities.

The future overlay must use:

- `bound`
- `unbound`
- `ambiguous`

It must classify intended-and-present, intended-but-absent, and present-but-unintended without modifying underlying facts or inventing domain names from code.

### Later expansion order

1. Intent reconciliation overlay.
2. Falsifiable checks over semantic changes.
3. Paste-ready evidence-grounded steering output.
4. Frontend store actions/pages as behavior doors.
5. Workers, scripts, and scheduled jobs.
6. Rename inference and deeper symbol indexing only when real diffs demand them.

---

## Full verification checklist

- [ ] `npm test`
- [ ] Serial/worker parity fixture
- [ ] Native/WASM parity on canonical Analysis IR
- [ ] Canonical hash stability across repeated scans
- [ ] Snapshot reuse and dirty-state separation
- [ ] Golden behavior/state diff scenarios
- [ ] Config mismatch and schema-version error paths
- [ ] Kalakar semantic evaluation command
- [ ] Kalakar clean snapshot -> code change -> bare `varai diff`
- [ ] Dashboard diff equals CLI diff
- [ ] Repository worktree remains free of generated snapshot artifacts tracked by Git

---

## Recommended execution discipline

- Commit each gate independently.
- Keep the pure Analysis IR, snapshot store, and differ separately testable through their interfaces.
- Add every discovered false semantic claim to the evaluator before fixing it.
- Prefer explicit `unverified` output over broader heuristics.
- Do not broaden stack coverage while backend semantic diff remains noisy.
- Stop and revisit the model if dogfood diffs collapse into fact lists rather than meaningful behavior/state changes.
