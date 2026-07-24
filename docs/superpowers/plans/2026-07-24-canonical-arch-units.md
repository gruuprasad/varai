# Canonical Arch-Unit Recovery (Mechanism Axis) — Implementation Plan

> **For executors:** Tasks are self-contained and ordered. Each task names exact files, the decision already made, and a "Done when" you can check. Task 1 is a spike whose result may adjust Task 3 — do it first and report before proceeding. Prefer one commit per task.

> ## 🔖 HANDOFF (2026-07-24, resume here)
>
> **Work happens in the worktree** `/.worktrees/canonical-arch-units` (branch `canonical-arch-units`, based on `origin/main`). Do NOT edit the main checkout. `node_modules` is symlinked; `npm test` works from the worktree root.
>
> **Done + committed (this branch, not yet pushed):**
> - **Task 1 (spike):** ran, result **no-go** on the original "reuse the call graph" premise (the implementation graph is a behavior call graph, not a dependency graph — 0 edges resolved). Findings recorded under "Spike results" below. This drove the Option A redesign of Task 3.
> - **Task 2 (kernel):** `depends_on` added to `RELATIONSHIPS` + display label + analyzer version `0.17.0→0.18.0` + kernel test. Commit `13d7834`.
> - **Task 3 (emission, Option A, Python-first):** import extraction → Element→Element `depends_on` claims. Commit `db4e6e6`. Tests 347→358, all green. Reviewed against the locked D-a…D-f decisions; matches. JS/TS import extraction is deferred (see Task 3 "Deferred").
>
> **State:** clean working tree, all 358 tests pass, `git diff --check` clean. Nothing pushed; no PR opened.
>
> **Next up — Task 6, then 7, then 8** (all independent of the edge source, straightforward):
> - **Task 6** `src/system-model/projections/arch-units.js` — group Elements into units (subsystem grain default), roll up Element→Element `depends_on` into a unit-level graph. Follow the `observed-areas.js` projection contract. Export from `projections/index.js`. Test.
> - **Task 7** — serialize `archUnits` in `src/server/projections.js`; add `depends_on` to `SEED_RELATIONS` (`src/seed/schema.js`) AND to `SEED_RELATION_TEXT` in `src/reporters/display-language.js` (there is a test asserting seed relations have text — mirror how Task 2 needed `RELATION_LABELS`); add `depends_on: ["arch.dependency"]` to `RELATION_CAPABILITIES` (`src/reconciliation/schema.js`); verify `varai diff` renders a `depends_on` line via the generic claims path (no `diff.js` change). Reconciliation test for a "UI must not depend on Data" style rule.
> - **Task 8** — remove `regionCandidates`/`observedAreas` from the default `serializeProjections` return (keep the modules + tests). Note the witness re-tasking idea.
>
> **Watch-outs proven this session:** (1) any new kernel relation needs a plain-English label or `test/reporters/display-language.test.js` fails — same will apply to the seed-relation text in Task 7. (2) WASM node wrappers lack object identity and `childrenForFieldName` (plural) — compare `startIndex`, use `namedChildren`. (3) parity (serial==worker==wasm) is asserted in `test/scanner-parity.test.js`; keep new emission deterministic.
>
> **To finish the branch:** `superpowers:finishing-a-development-branch` (push + PR are separate user-authorized steps — not yet done).

**Goal:** Add one kernel relation, `depends_on` (Element → Element static dependency), so varai recovers the codebase's mechanism decomposition (arch units + dependency edges) as canonical, diffable, bindable Claims — with zero authoring-time injection.

**Architecture:** Emit `depends_on` Claims during lift by resolving the existing symbol-level implementation graph's edges to owning Elements. The edge is a canonical kernel fact; "what a unit is" stays a retunable projection. Because `diff.js` diffs the `claims` collection generically, dependency drift surfaces in `varai diff` with no diff-code change.

**Tech stack:** Node ESM, `node:test` + `node:assert/strict`. No new deps. No LLM, no network in scan/diff/check.

**Direction:** ADR 0004 (the System Model *is* the product). Extends the kernel by exactly one relation; adds no new role and no parallel IR. On the critical path this supersedes the subject-axis recovery in `projections/semantic-region-candidates.js` / `projections/observed-areas.js` (demoted in Task 8, not deleted).

---

## Why (kept from design)

varai recovers two orthogonal decompositions of one codebase:

- **Mechanism axis (arch units)** — how code is physically filed: subsystems, modules, and the **dependency edges** between them. A *partition*: every construct sits in exactly one place, so it is canonical by construction, needs no threshold, and is recoverable on any repo with zero injection.
- **Subject axis (anchor-lift)** — what code is *about*, recovered by counting convergent effect-claims. An *overlapping cover*: threshold-dependent, provisional — the source of real-world "hit-and-miss."

We pivot the compute-plane to the mechanism axis because it is the reliable, always-committed axis, and because varai no longer needs to *reverse-engineer* the subject — meaning is injected at authoring time through seed + binding + builder tags. Arch units are the deterministic coordinate substrate that injected bindings pin onto.

No backward compatibility to preserve: pre-release, single user, regenerable snapshots, no external consumers. The analyzer-version bump is a one-time recompute, not a migration.

---

## Key decisions (resolved — do not re-litigate)

These are the complex parts, decided. Executors implement to these; do not invent alternatives.

1. **Relation name & grain.** One new relation `depends_on`, **Element → Element**, one deduplicated claim per ordered `(sourceElementId, targetElementId)` pair. Contributing sites are collected as **evidence** on that single claim, never emitted as separate claims. Claim count is O(distinct element pairs), not O(imports).

2. **Target of `depends_on` is always a reference** (`{ kind: "reference", id: <targetElementId> }`). Never a literal. If the target symbol cannot be resolved to an owning Element, emit **nothing** and record a **coverage gap** (see decision 5) — never a guessed edge.

3. **Owning-Element resolution index (the crux mechanism).** Build a map `ownerOf: "${normalizedFile}\0${symbol}" -> elementId` from every Element's `evidence` and `implementationPath` entries (both already carry `{ file, line, symbol }`; normalize file with the kernel's `normalizePath`). Resolve each raw edge endpoint through this index. This reuses existing element↔symbol evidence — no new extraction. When multiple Elements claim the same `(file, symbol)`, pick the lexicographically smallest `elementId` for determinism and record a diagnostic.

4. **Raw edge source.** Symbol-level edges come from the existing implementation graph (`src/scanners/lift/implementation-graph.js`, `graph.values().edges`, each `{ from, kind, to, evidence }` where node ids are `kind:file:symbol`). **Task 1 (spike) confirms which edge kinds exist and what fraction resolve** before wiring. Node id → `(file, symbol)` is recovered by splitting on `:` per `privateNodeId(kind, file, symbol)`.

5. **Unresolved = coverage gap, not an edge.** When either endpoint fails to resolve to an Element, add one deduped `diagnostic` (code `depends-on-unresolved`, capability `arch.dependency`, severity `warning`) carrying the raw endpoint evidence. Do not emit a claim.

6. **Self-edges dropped** (source Element == target Element).

7. **Emission capability.** `depends_on` claims use `capability: "arch.dependency"`, `observationMethod: "ast"`, `claimState: "observed"`. Coverage for the whole scan under this capability is emitted so absence discipline works in reconciliation (Task 7).

8. **Unit grouping stays a projection.** The *edge* is a canonical kernel fact. *What a unit is* (subsystem grain, module grain) lives in `projections/arch-units.js` and is retunable without re-scan. Subsystem→Subsystem / module→module dependency is a **rollup in the projection**, not a separate kernel claim.

9. **Version bump.** Bump `SYSTEM_MODEL_ANALYZER_VERSION` (extraction changed → cache invalidates). Do **not** bump `SYSTEM_MODEL_SCHEMA_VERSION` — the persisted claim shape is unchanged (a `depends_on` claim is structurally identical to any other reference-target claim). A projection-only change (Task 6) bumps neither.

---

## File map

| File | Task | Change |
|---|---|---|
| `docs/adr/0006-canonical-arch-units-and-depends-on.md` | 0 | new ADR |
| `docs/semantic-language.md` | 0 | add `depends_on` to relation table |
| `src/system-model/schema.js` | 2 | add `"depends_on"` to `RELATIONSHIPS` |
| `src/system-model/version.js` | 2 | bump analyzer version |
| `src/scanners/lift/dependency-edges.js` | 3 | **new** — resolve graph edges → `depends_on` drafts + gaps |
| `src/scanners/lift/index.js` | 3 | accept graph edges, call resolver, add claims + coverage |
| `src/scanners/index.js` | 3 | pass `graph.values().edges` into `liftSystemModel` |
| `src/system-model/projections/arch-units.js` | 6 | **new** projection |
| `src/system-model/projections/index.js` | 6 | export `archUnits` |
| `src/server/projections.js` | 7 | serialize `archUnits` |
| `src/seed/schema.js` | 7 | add `depends_on` to `SEED_RELATIONS` |
| `src/reconciliation/schema.js` | 7 | add `depends_on: ["arch.dependency"]` to `RELATION_CAPABILITIES` |
| `src/system-model/projections/index.js` + `src/server/projections.js` | 8 | demote anchor-lift from default path |
| `test/fixtures/arch-units/*`, `test/system-model/*`, `test/scanners/*` | 2,3,6,7 | fixtures + tests |

---

## Tasks

### Task 0 — Lock the contract (docs only)

**Files:**
- Create `docs/adr/0006-canonical-arch-units-and-depends-on.md` following the house ADR style (see `docs/adr/0005-seed-realization-and-reconciliation.md`). Record: the axis reframe, `depends_on` as a new observed structural relation, Element→Element grain, edge-as-claim / grouping-as-projection split, anchor-lift demotion, no backward-compat, analyzer-version-only bump.
- Modify `docs/semantic-language.md`: add a **Structure** subsection to the relationship table with:
  `| `depends_on` | An Element statically depends on another Element (import/reference), distinct from `invokes` (behavior flow) and `contains` (containment). |`

**Done when:** ADR 0006 exists and does not contradict ADR 0004; the relation table documents `depends_on`.

---

### Task 1 — Spike: does the implementation graph yield resolvable Element→Element edges? (gate)

This answers the one genuine unknown before code is committed. **Do not skip.** No production code — a throwaway probe + a written finding.

**Context you need (already verified):**
- `src/scanners/lift/implementation-graph.js` exposes `graph.values()` → `{ nodes, edges }`; each edge is `{ from, kind, to, evidence }`, node ids are `kind:file:symbol` (`privateNodeId`).
- The graph is created at `src/scanners/index.js:152` and passed into `traceBehaviors` (`src/scanners/index.js:158`). It is **not** currently passed to `liftSystemModel` (`src/scanners/index.js:241`).
- Elements carry `evidence` and `implementationPath` arrays of `{ file, line, symbol }` (see `src/scanners/lift/index.js` `addElement`, and the lifted model).

**Do:** Write a temporary script (e.g. `tmp-depends-probe.mjs`, delete after) that runs a real scan on `test/fixtures/system-model-app` (and, if time allows, on the varai repo itself — the dogfood target). After `liftSystemModel`, dump: (a) total graph edges by `kind`; (b) how many edges have **both** endpoints resolvable through the `ownerOf` index (decision 3); (c) how many resolve to **distinct** Elements (real cross-Element edges); (d) how many are unresolved.

**Report (write findings into this file under a new "Spike results" section):**
- Which edge `kind`s exist and which represent real static dependencies (imports/calls) vs noise.
- Resolution rate to distinct Elements.

**Decision this gates:**
- If a meaningful fraction of edges resolve to distinct Elements → proceed to Task 3 wiring the graph edges as the raw source.
- If **most** real edges do not resolve to owning Elements → **stop**. The element↔symbol evidence is the real gap; fix that first (a separate plan). This is a Failure criterion, not a workaround-with-guesses.

**Done when:** "Spike results" section is filled in and the go/no-go is explicit.

#### Spike results (2026-07-24) — **NO-GO on the current graph as edge source**

Probed a real scan on four fixtures (`system-model-app`, `behaviors-app`, `nextjs-api-join`, `resource-lifecycle`) after temporarily exposing `graph.values().edges` from `scanRepo`, building the `ownerOf` index (decision 3) from Element `evidence` + `implementationPath`, and splitting node ids `kind:file:symbol`.

**Finding: 0 distinct Element→Element pairs resolved on any fixture.** Richest case (`behaviors-app`): 15 elements, 24 graph edges (`binds:7, calls:14, targets:3`), of which **1** landed both ends on the same Element (a self-edge) and **23 were unresolved**. Distinct pairs: **0**.

Root cause — the implementation graph is a **behavior-body call graph, not a module dependency graph**, and its node vocabulary does not intersect Element evidence:
- Graph nodes are `interface` (routes like `POST /api/auth/login`), `function` (impl symbols like `login`, `apply_mutation`, `persist_document`), and `effect` nodes. Edges are `binds` (route→handler), `calls` (fn→fn), `targets` (fn→effect). Emitters: `src/scanners/behaviors/index.js:43`, `src/scanners/behaviors/body.js:172,309`.
- Element evidence symbols are **types/contracts** (`LoginRequest`, `Item`, `QuantitiesResponse`) or, for `operation` Elements, **`null`** — route operations carry no `symbol` in their evidence at all.
- So the function/route symbols at graph endpoints are never the symbols recorded on Elements. The two namespaces are disjoint by construction.

**Conclusion:** the premise "resolve the existing implementation graph's edges to owning Elements" does not hold on the current extraction. This is the plan's own Failure criterion ("`depends_on` cannot be resolved to owning Elements for most real edges → the element↔symbol evidence is the real gap, fix that first"). **Stopping before Task 3.** Tasks 2, 6, 7, 8 are independent of the edge *source* and remain valid; only Task 3's *emission* is blocked. See "Decision after spike."

#### Decision after spike (needs user input before Task 3)

Emission needs a real static-dependency signal that resolves to Elements. Options:
- **(A) Add module-import extraction** — a new observation recording `import`/`from … import` as file→file (and symbol→symbol) edges, and give `operation`/`function` Elements a real `symbol`. Largest work; the honest fix that makes mechanism-axis edges first-class.
- **(B) File/module-grain `depends_on` from imports only** — skip symbol resolution; owning Element = the Element(s) whose evidence lives in file F. Coarser, but every repo has imports and file→Element is already known. Smallest path to a useful canonical edge.
- **(C) Enrich Element evidence with symbols + reuse the existing call graph** — record handler/function `symbol` on `operation` Elements so `calls`/`binds` start resolving. Reuses the graph but changes lift broadly.

**Recommended: (B) first**, then layer (A)/(C) for symbol precision — injection-free, present in every repo, matches the "mechanism axis is the reliable signal" thesis.

---

### Task 2 — Kernel accepts `depends_on` (no emission yet)

**Files:**
- Modify `src/system-model/schema.js`: add `"depends_on"` to the `RELATIONSHIPS` frozen array (append after `"stored_in"`). `validate.js` derives `RELATIONSHIP_SET` from this, so no `validate.js` edit is needed.
- Modify `src/system-model/version.js`: bump `SYSTEM_MODEL_ANALYZER_VERSION` `"0.17.0" -> "0.18.0"`. Leave `SYSTEM_MODEL_SCHEMA_VERSION` at `2` (decision 9).
- Create `test/system-model/depends-on-kernel.test.js`.

**What to verify (outcomes, not micro-steps):** hand-author a small model via `createSystemModel` with two Elements and one `depends_on` reference claim (see `test/system-model/diff.test.js` for the model-building idiom). Assert:
- it `validateSystemModel`s without error and canonicalizes byte-identically under input reordering;
- `diffSystemModels(before, after)` reports the added `depends_on` through `diff.claims.added` / `diff.summary.claimsAdded` **with no change to `diff.js`** (this is the core payoff — assert it explicitly);
- the claim carries `evidence` and participates in coverage like any other claim.

**Done when:** `npm test` passes; the kernel round-trips and diffs `depends_on` with zero new diff/merge logic.

---

### Task 3 — Scanner emits `depends_on` (the real work) — **Option A, Python-first slice**

The spike killed the "reuse the call graph" premise. Option A (chosen): extract **module imports** as the dependency signal, resolve endpoints to owning Elements. Scope this task to **Python** (the fixtures + dogfood target are Python; JS/TS is an explicit follow-up, see deferrals). Reuse the existing Python module-resolution machinery — do **not** re-implement it.

#### Locked design decisions (the complex part — do not deviate)

**D-a. Import source of truth.** Reuse `src/scanners/behaviors/symbol-index.js`: `buildModuleMap` + `resolveModule` already turn a Python `from X import Y` into a target file, and `importsIn(file)` already yields `Map<localName, { target, imported }>`. Build a small import collector on top of these — no new module resolver.

**D-b. Where extraction runs.** Lift has no file/AST access. Collect imports during scan in `src/scanners/index.js` (it has `files` + `ctx` + the resolver), producing a flat list `importEdges` of raw edges, then pass it into `liftSystemModel` as a new named field. Resolution to Elements happens in lift (which has the elements).

**D-c. Raw import-edge shape** (what the collector emits, one per `(usageSiteSymbol → importedSymbol)`):
```js
{ fromFile, fromSymbol, toFile, toSymbol, evidence: { file: fromFile, line } }
// fromSymbol = the name of the top-level def/class ENCLOSING the import usage,
//   or null for a module-level import.
// toSymbol  = the imported name resolved in the target module.
```
Use tree-sitter (`ctx.tree(file,"python")`, `queryTree`) to find `import_from_statement` nodes and their enclosing `function_definition`/`class_definition` (walk `node.parent` until one is found; null if top-level).

**D-d. Element symbol enrichment (the "give operations real symbols" half of Option A).** In `src/scanners/lift/index.js`, when creating the `api`/`operation` Element (around line 340) and the `application`/`operation` Element (around line 393), add the handler/function symbol to the Element's evidence. Route operations: the behavior already carries `behavior.handler = { file, line, symbol }` (`src/scanners/behaviors/index.js:53`); include `symbol: behavior.handler.symbol` on the door evidence entry. This makes `ownerBySymbol` resolvable for operations, which the spike proved was the gap.

**D-e. Owning-Element resolution + attribution (the density-safety decision).** In lift build:
- `ownerBySymbol: Map<"${normalizePath(file)}\0${symbol}", elementId>` from every Element's `evidence` + `implementationPath` entries that have a `symbol` (collision → lexicographically smallest id + diagnostic, per decision 3).
- For each raw import edge: `targetId = ownerBySymbol[(toFile,toSymbol)]`; `sourceId = ownerBySymbol[(fromFile,fromSymbol)]`.
- **Attribution rule (locked):** emit an edge **only when BOTH endpoints resolve to a specific Element via symbol**. A module-level import (`fromSymbol=null`) or any endpoint that does not resolve to an owning Element → **coverage gap** (`depends-on-unresolved` diagnostic), never a fanned-out or file-grain edge. This caps density at O(real symbol→symbol dependencies) and honors decisions 1, 2, 5. (File-grain fallback is explicitly rejected here — it was Option B, not chosen.)
- Drop self-edges (`sourceId === targetId`, decision 6).

**D-f. Claim emission.** One deduped claim per ordered `(sourceId, targetId)`; all contributing import sites merged as `evidence`. Shape via the existing `addClaim` helper:
`{ source: {kind:"element",…}/*or sourceId*/, relation:"depends_on", target:{kind:"reference", id: targetId}, slot:\`depends_on:${targetId}\`, evidence:[…sites], capability:"arch.dependency", observationMethod:"ast", claimState:"observed" }`.
(`canonicalize.js` resolves `target.reference`; since we already hold `targetId`, pass `target:{kind:"reference", id: targetId}` directly and `source` via the element's `{subsystemKey,elementKind,key}` or its id.)

#### Files
- Create `src/scanners/imports/python-imports.js` — `collectPythonImports(files, ctx) -> importEdges[]` using `symbol-index` module resolution + tree-sitter enclosing-symbol lookup (D-a, D-c).
- Create `src/scanners/lift/dependency-edges.js` — pure `resolveDependencyEdges({ importEdges, elements }) -> { claims, diagnostics }` implementing D-e/D-f. Uses `normalizePath` from `src/system-model/identity.js`.
- Modify `src/scanners/lift/index.js` — D-d enrichment; accept `importEdges`; call `resolveDependencyEdges`, push claims via `addClaim`, diagnostics into `finalDiagnostics`; add one `arch.dependency` coverage entry for the system scope (absence discipline).
- Modify `src/scanners/index.js` — after the resolver exists (~line 200), `const importEdges = await collectPythonImports(files, ctx);` and pass `importEdges` into `liftSystemModel({...})` (line 241).
- Create fixture `test/fixtures/arch-units/{base,dependency-added}` — small multi-module Python repos; `dependency-added` adds exactly one real cross-module import used inside a resolvable handler.
- Create `test/scanners/dependency-edges.test.js` (unit, synthetic `importEdges` + elements) and `test/system-model/arch-units-emit.test.js` (end-to-end scan of the fixture).

#### What to verify (outcomes)
- known imports produce the expected deduped Element→Element edges and no others;
- renaming a private helper (non-Element symbol) changes evidence only — no `depends_on` identity change;
- adding one real cross-module dependency between two resolvable operations adds **exactly one** new `depends_on` claim, visible in `diffSystemModels`;
- a module-level or unresolved import → `depends-on-unresolved` diagnostic, **not** a claim;
- reordering inputs → byte-identical output;
- serial==worker and native==WASM `depends_on` sets equal (extend `test/scanner-parity.test.js`).

**Done when:** a scan of the fixture yields a correct, deduped, evidence-traced dependency graph as canonical Claims; density stays at symbol-pair grain; parity holds; `npm test` green.

**Deferred:** JS/TS import extraction (reuse `render-graph.js`/`react-vite.js` `import_statement` parsing) as a follow-up collector feeding the same `importEdges` contract.

---

### Task 6 — `arch-units` projection

**Files:**
- Create `src/system-model/projections/arch-units.js`. Follow the projection contract used by `src/system-model/projections/observed-areas.js`: takes `model`, calls `validateSystemModel(model)`, returns a plain object with a `kind` field; **derives only** — no invented facts, deterministic ordering (sort by id).
- Modify `src/system-model/projections/index.js`: add `export { archUnits } from "./arch-units.js";`.
- Create `test/system-model/arch-units.test.js`.

**Behavior:** group Elements into units (default **subsystem grain**; module grain as a retunable option) and expose the **unit-level dependency graph** by rolling up Element→Element `depends_on` edges (decision 8). Report per unit: member element ids, inbound/outbound unit dependencies, and cross-unit edge counts.

**What to verify:** units and their edges derive purely from existing claims; grain is switchable without re-scan; deterministic ordering; no new facts invented.

**Done when:** `varai` can present arch units and their dependencies as a projection with no kernel change.

---

### Task 7 — Surface + rules (diff, dashboard, seed commitments)

Three small wirings; they share the "reuse existing machinery" theme.

**Files:**
- Modify `src/server/projections.js`: add `archUnits: archUnits(model),` to `serializeProjections` and import it from `../system-model/projections/index.js`.
- `varai diff` narration: dependency drift already flows through `diff.claims` and `renderSemanticDiff` (`src/reporters/diff-markdown.js`) generically. Verify a `depends_on` add/remove renders a readable line at unit altitude; add a label/format branch only if the generic output is unclear. Do **not** add new diff logic in `diff.js`.
- Modify `src/seed/schema.js`: add `"depends_on"` to `SEED_RELATIONS` (so an arch-unit rule is authorable seed intent).
- Modify `src/reconciliation/schema.js`: add `depends_on: Object.freeze(["arch.dependency"])` to `RELATION_CAPABILITIES` (so absence discipline: a missing edge is `violated` only when `arch.dependency` reports `analyzed`, else `cannot_verify`).
- Tests: extend `test/reconciliation/*` with a fixture rule (e.g. "UI must not depend on Data internals").

**What to verify:**
- dashboard payload includes `archUnits`;
- a `depends_on` change shows in rendered diff;
- a satisfied dependency rule is `holds`; a forbidden-but-present dependency is `violated` under analyzed coverage; absent coverage → `cannot_verify`. **No new verifier path** — this reuses `src/reconciliation/check.js`.

**Done when:** a person sees arch units + their edges + what changed between scans, and an arch-unit rule is checkable through the existing deterministic verifier.

---

### Task 8 — Demote anchor-lift from the critical path

**Files:**
- Modify `src/server/projections.js`: remove `regionCandidates` and `observedAreas` from the default `serializeProjections` return (or fence behind an explicit flag). Keep the projection modules and their tests.
- Leave `src/system-model/projections/index.js` exports intact (code stays importable).
- Add a short note (in ADR 0006 or a code comment) that convergence machinery may later return as a **witness** that checks injected bindings against observed structure (witness-not-judge), not as a default product surface.

**Done when:** the subject-axis projection no longer gates or clutters the mechanism-axis product; nothing is deleted; tests still pass.

---

## Global verification

```
npm test
git diff --check
```

Must additionally hold:
- `depends_on` emission is deterministic; reordering yields byte-identical models;
- `diff.js` reports dependency drift with **no** diff/merge code change;
- native/WASM and serial/worker `depends_on` sets are equal;
- the analyzer-version bump invalidates the extraction cache; a projection-only change does not;
- unresolved dependencies are coverage gaps, never edges;
- a repo without a seed still works — arch units observed with zero injection;
- no LLM and no network in scan, diff, or check.

## Explicit deferrals

- symbol-level dependency claims (kept as evidence only);
- module-grain default (subsystem grain first; module grain is a projection option);
- re-tasking convergence as a binding witness (Task 8 note only);
- cross-representation identity work beyond what already exists;
- any subject-axis recovery.

## Failure criteria (stop and revise)

- Task 1 spike shows most real edges do not resolve to owning Elements → the element↔symbol evidence is the real gap; fix that first.
- dependency edges too dense to diff meaningfully even at Element grain → revisit rollup grain before UI.
- arch-unit rules need an LLM to evaluate → the axis choice is wrong.

## Definition of done

A fresh user can scan a repo (no seed required), see its arch units and the dependency graph between them, run `varai diff` across two scans and see dependency drift, and express an arch-unit rule as a seed commitment that the deterministic verifier checks — all with the System Model unchanged as the single observed product.
