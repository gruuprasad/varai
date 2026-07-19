# Anchor-Based Lift — Implementation Plan

> **Status:** Ready to implement after acceptance of `docs/superpowers/specs/2026-07-19-anchor-based-lift-design.md`.
>
> **Execution rule:** Complete the gates in order. Do not start prominence or UI work until referent binding and behavior identity pass their semantic fixtures.

## Goal

Replace Varai's 1:1 promotion of routes, schemas, and components with a deterministic lift that organizes the System Model around stable Resource subjects and UI surfaces:

```text
repository observations
    -> private implementation graph
    -> referent binding and effect resolution
    -> Resource / Behavior / Interface Elements and Claims
    -> ranked anchor projections
    -> current-system map, drill-down, and semantic diff
```

The first serious acceptance system is Kalakar, especially its `BuildingModel` path across `services/frontend`, `services/backend`, and `src/kalakar`. Generic fixtures establish the rules; Kalakar validates usefulness. Trux and Varai are guardrails against vocabulary or analyzer rules that only fit Kalakar.

## Architecture decisions for implementation

- Keep one canonical System Model. Do not restore Analysis IR, behavior cards, stock tags, or another persisted product model.
- The implementation graph is ephemeral analyzer machinery. It may use source-bound node identity because it is never snapshotted or diffed.
- Distill each successful graph path into an ordered `implementationPath` on the resulting Element or Claim. The path contains source evidence only; it is persisted with the canonical model, excluded from semantic identity, and compared as evidence movement.
- Keep `anchor` out of the kernel. `Resource`, `Behavior`, and `Interface` are canonical roles; prominence is a pure projection over Elements and Claims.
- Effects bind to declaration identities before convergence is calculated. Repeated strings such as `file`, `dict`, or `unknown resource` never create Resource Elements.
- Anchors group Behaviors. They do not define or merge Behavior identity.
- Preserve API operations as stable Interface Elements. They may also be Behaviors when no separately evidenced Application Behavior exists; otherwise the Interface `offers` the promoted Application Behavior.
- Keep boundary contracts as Resource Elements. Private DTOs and intermediate schemas remain implementation evidence.
- Varai is pre-release: replace the current direct-promotion path cleanly. Do not add a compatibility model or migration layer. Existing semantic snapshots must be recreated after the model/analyzer version change.

## Gate 0 — Lock the semantic contract with fixtures

### Purpose

Turn the design's seven acceptance statements into executable failures before changing the lift.

### Tasks

- Add a compact Python/FastAPI fixture containing:
  - a persisted `Project` Resource;
  - a non-persisted `BuildingDocument` aggregate;
  - separate add-wall, delete-storey, and import-model actions that affect the same aggregate;
  - one public request/response contract and private intermediate DTOs;
  - a helper chain between an endpoint and an effect;
  - two unrelated same-named declarations;
  - an unresolved file-writing path.
- Add an equivalent refactored fixture where helpers are renamed and split without changing externally observable behavior.
- Add a contract-change variant where only a public response contract changes.
- Assert canonical Elements, Claims, claim state, coverage, semantic IDs, and evidence-only movement. Avoid snapshotting the entire model unless a small focused expected object is easier to understand.
- Replace the stale Behavior Cards checklist with a System Model acceptance checklist containing user questions rather than expected framework-shaped cards.

### Critical files

- Create: `test/fixtures/anchor-lift/base/`
- Create: `test/fixtures/anchor-lift/refactored/`
- Create: `test/fixtures/anchor-lift/contract-changed/`
- Create: `test/system-model/anchor-lift.test.js`
- Create: `test/system-model/anchor-diff.test.js`
- Replace: `docs/kalakar-acceptance-checklist.md`

### Acceptance

- Private helper refactoring is evidence-only.
- Three actions on one Resource remain three Behaviors.
- A public response-contract change is semantic.
- Same-name declarations do not merge.
- An unresolved target creates coverage/diagnostic output, not a Resource.
- The tests fail for the current 1:1 `buildSystemModel` implementation for the expected reasons.

## Gate 1 — Build the private implementation graph and provenance path

### Purpose

Give analyzers a bounded, queryable structure for resolving endpoint-to-effect paths without making that structure a product model.

### Tasks

- Add a small graph module with deterministic insertion, adjacency queries, path search, work-budget accounting, and diagnostics when the budget is exhausted.
- Use source-bound private nodes for declarations, functions/actions, interfaces, calls, contracts, and effects. Edge types are analyzer mechanics such as call, bind, return, and effect-target; they are not System Model vocabulary.
- Extend the Python symbol index to record qualified function and class declarations, direct imports, aliases, and the existing bounded re-export resolution.
- Change FastAPI behavior tracing from independently flattening each handler to contributing nodes and edges to one scan-level graph.
- Preserve the complete call chain for every recovered input, output, condition, failure, and state effect.
- Keep unsupported calls explicit. A budget limit or unsupported syntax must downgrade the responsible capability to `partial`, not silently terminate the path.
- At model-construction time, distill only the source evidence along a successful path into ordered `implementationPath` metadata; discard the graph afterward.

### Critical files

- Create: `src/scanners/lift/implementation-graph.js`
- Create: `src/scanners/lift/provenance.js`
- Modify: `src/scanners/behaviors/symbol-index.js`
- Modify: `src/scanners/behaviors/resolver.js`
- Modify: `src/scanners/behaviors/handlers.js`
- Modify: `src/scanners/behaviors/body.js`
- Modify: `src/scanners/behaviors/signature.js`
- Modify: `src/scanners/behaviors/index.js`
- Modify: `src/scanners/index.js`
- Add: `test/scanners/implementation-graph.test.js`
- Extend: `test/behaviors/trace.test.js`

### Acceptance

- A route-to-helper-to-effect path is recovered in order with every source location.
- Helper aliases and supported re-exports resolve to the same declaration node.
- Cycles terminate deterministically.
- Work-budget exhaustion produces a stable diagnostic and partial coverage.
- The graph is absent from `scan.model`, snapshots, JSON model output, and semantic hashes.
- Distilled implementation paths remain available on the claims they prove.

**Stop condition:** Do not promote convergence Resources until effects resolve to declaration identities through this graph.

## Gate 2 — Recover referents and bind cross-representations

### Purpose

Establish what code acts on before counting convergence or choosing browse roots.

### Tasks

- Build a declaration registry over persisted entities, schema/contracts, named Python aggregates, frontend state stores, screens, and stable interface boundaries. Indexing a declaration does not itself promote it.
- Give private declarations qualified analyzer identities based on language/module/symbol. Source paths may participate in these private IDs; canonical System Model identity is assigned only after promotion.
- Resolve effect targets to declarations using symbol/import/call information and type/constructor evidence.
- Recognize provable representation links across:
  - handler request/response annotations;
  - serialization/deserialization or conversion calls;
  - API client request/response boundaries where a literal method/path resolves to an operation;
  - frontend state assignments fed by a resolved API response.
- Never merge declarations from normalized names alone. Emit an `ambiguous` binding with candidate evidence when names match but structural linkage is absent.
- Classify contracts after usage is known:
  - contracts referenced by `accepts`, `produces`, or published payload claims are boundary/public;
  - unreferenced private DTOs remain graph/evidence nodes.
- Count convergence only from resolved interactions by distinct stable Behaviors. Select the initial minimum from positive and negative fixture distributions, encode it as a named analyzer constant, and document the rationale. Do not tune it only to make `BuildingModel` pass.
- Treat unresolved generic targets (`file`, `unknown resource`, receiver names) as coverage gaps unless a stable file/artifact declaration or path is structurally known.

### Critical files

- Create: `src/scanners/lift/declarations.js`
- Create: `src/scanners/lift/bindings.js`
- Create: `src/scanners/lift/contracts.js`
- Modify: `src/scanners/extractors/schema.js`
- Modify: `src/scanners/extractors/sqlalchemy.js`
- Modify: `src/scanners/extractors/fastapi.js`
- Modify: `src/scanners/extractors/react-vite.js`
- Modify: `src/scanners/frontend/interactions.js`
- Modify: `src/scanners/behaviors/effects.js`
- Add: `test/scanners/referent-binding.test.js`
- Add: `test/scanners/cross-representation.test.js`

### Acceptance

- Resolved interactions with one aggregate converge on one declaration identity.
- Same-named declarations without a structural path remain separate and surface ambiguity.
- Boundary contracts are retained; private DTOs are not promoted.
- Literal file and unknown-resource effects do not create Resources.
- A representation conversion carries evidence from both sides of the link.

Because extractor/analyzer observations change, bump `EXTRACTOR_VERSION` in `src/scanners/cache.js` in the same commit as the first such change. Preserve native/WASM and serial/worker parity.

## Gate 3 — Replace direct promotion with the anchor-based lift

### Purpose

Make the canonical System Model express stable system subjects, behaviors, interfaces, contracts, and their relations instead of renamed source inventory.

### Tasks

- Introduce a lift orchestrator that consumes the private graph and resolved bindings and emits only framework-neutral draft Elements, Claims, coverage, diagnostics, evidence, and implementation paths.
- Reduce `src/system-model/build.js` to generic canonical model assembly. Remove direct branching on `api_route`, `schema`, `component`, `db_model`, and other observation kinds from the System Model package.
- Promote Resource Elements from:
  - persisted declarations; or
  - named declarations that meet resolved-convergence rules.
- Promote boundary/public contracts as Resource Elements and attach `accepts`/`produces` claims to them. Do not promote every schema found in a repository.
- Form Behaviors conservatively:
  - retain an entry-point Behavior at a stable interface boundary when no deeper boundary is proven;
  - promote an Application Behavior only when a resolved callable owns a meaningful contract/effect/outcome or coordinates other proven Behaviors;
  - never create a higher-level workflow solely because several actions touch one Resource.
- Keep distinct add/delete/import actions distinct even when grouped under one Resource.
- Emit `offers`, `invokes`, effects, contracts, conditions, outcomes, and representation relationships only when their graph paths are resolved. Preserve claim state and coverage when resolution is partial.
- Extend canonicalization/validation to retain ordered `implementationPath` metadata while excluding it from Element/Claim semantic identity.
- Treat `implementationPath` changes like evidence movement in `diffSystemModels`.
- Increment `SYSTEM_MODEL_SCHEMA_VERSION` and `SYSTEM_MODEL_ANALYZER_VERSION`. Reject or clearly explain comparisons with incompatible existing snapshots; do not implement dual-schema migration.

### Critical files

- Create: `src/scanners/lift/index.js`
- Create: `src/scanners/lift/promote.js`
- Create: `src/scanners/lift/behaviors.js`
- Modify: `src/scanners/index.js`
- Refactor: `src/system-model/build.js`
- Modify: `src/system-model/canonicalize.js`
- Modify: `src/system-model/validate.js`
- Modify: `src/system-model/identity.js`
- Modify: `src/system-model/diff.js`
- Modify: `src/system-model/version.js`
- Extend: `test/system-model/schema.test.js`
- Extend: `test/system-model/identity.test.js`
- Extend: `test/system-model/diff.test.js`
- Extend: `test/system-model/projection.test.js`

### Acceptance

- The Gate 0 fixtures pass.
- Component/helper splitting preserves semantic identity.
- Evidence and implementation-path movement are reported separately from semantic change.
- Adding another route that acts on an existing Resource does not replace that Resource.
- No framework-specific term enters kernel kinds, roles, relationships, or identity.
- Current schema-v1 snapshots fail with an explicit recreate-baseline instruction.

**Stop condition:** Do not design the dashboard around anchors until the canonical model passes identity, honesty, and diff tests.

## Gate 4 — Derive ranked anchor projections

### Purpose

Make the model navigable without storing prominence as semantic truth.

### Tasks

- Add pure projection functions over a validated System Model:
  - `browseByThing(model)` for Resource subjects and UI surfaces;
  - `browseByCapability(model)` for Behaviors and their reach/effects.
- Derive prominence using an explicit ordered tuple rather than opaque weighted scoring. The initial ordering should prefer:
  1. UI surfaces and Resources with resolved Behavior interactions;
  2. persisted Resources with interactions;
  3. other stable Resources;
  4. Interfaces and private/internal records as reach/detail.
- Within a tier, sort by distinct Behavior count and then stable semantic identity. Keep the full model searchable regardless of prominence.
- Return view objects containing references to canonical IDs only. Do not persist projections or introduce projection IDs into snapshots/diff.
- Ensure adding one Behavior can change ordering but cannot create a semantic model diff merely because ranking changed.
- Provide projection diagnostics for orphan Behaviors, unresolved effects, and Resources without known interactions.

### Critical files

- Create: `src/system-model/projections/browse-by-thing.js`
- Create: `src/system-model/projections/browse-by-capability.js`
- Create: `src/system-model/projections/index.js`
- Add: `test/system-model/anchor-projection.test.js`

### Acceptance

- Default browse roots contain subject Resources and UI surfaces, not a wall of endpoints or components.
- All endpoints, boundary contracts, and evidence remain reachable through detail/search.
- Projection output is deterministic under input ordering changes.
- Ranking changes do not affect canonical model hashes or semantic diffs.

## Gate 5 — Render overview, behavior, and implementation drill-down

### Purpose

Deliver the actual day-to-day product surface:

```text
system overview
    -> Resource or UI surface
        -> Behavior
            -> Interface and implementation path
                -> source evidence
```

### Tasks

- Change Markdown map output from subsystem inventory to the browse-by-thing projection. Show Behavior contracts/effects and reach paths under each root, with unresolved coverage beside the affected area.
- Keep a compact coverage/diagnostics section and an explicit full-detail section or flag for users who need every Element.
- Change the dashboard's default `System` view to ranked anchor cards rather than all Elements.
- Add a `Capabilities` view using the second projection.
- Add in-place drill-down from anchor to Behavior to Interface/contract/effect claims and ordered implementation path.
- Keep global search across every canonical Element, including non-prominent Resources and Interfaces.
- Preserve the existing Progression and Coverage views, but label semantic changes using the anchor/behavior context when available.
- Do not add LLM narration or prompt/document ingestion.

### Critical files

- Modify: `src/reporters/system-model-markdown.js`
- Modify: `src/reporters/diff-markdown.js`
- Modify: `src/server/index.js`
- Modify: `src/ui/app.js`
- Modify: `src/ui/index.html`
- Modify: `src/ui/styles.css`
- Extend: `test/system-model/renderer.test.js`
- Extend: `test/map.test.js`

### Acceptance

- The generic fixture overview is compact and subject-oriented.
- A user can walk Resource -> Behavior -> Interface -> ordered source path without reading a flat inventory.
- Boundary contract changes remain visible in both map detail and progression.
- Partial/ambiguous analysis is visible where it matters, not only in a global footer.
- Keyboard navigation, focus state, and small-screen layout remain usable.

## Gate 6 — Prove the vertical slice on Kalakar and guard against overfitting

### Kalakar focused run

Scan the three layers needed for the first subject slice:

```bash
node ./bin/varai.js map ../kalakar \
  --include services/frontend/src \
  --include services/backend \
  --include src/kalakar
```

Use the updated checklist to answer from Varai, without source-first exploration:

- Is `BuildingModel` recovered as a Resource subject, and what evidence promoted it?
- Which distinct Behaviors read or change it?
- Through which UI/API Interfaces are those Behaviors reached?
- Where does a selected wall-editing or rendering Behavior travel through implementation?
- Which boundary contracts enter and leave that path?
- What effects or links remain unresolved, and why?

### Guardrail runs

- Scan Varai itself and verify that repository/model/report artifacts and CLI commands can be navigated without adding Kalakar domain vocabulary.
- Scan Trux and verify that mobile screens/actions and Resources use the same kernel and projection rules.
- Record genuine missing analyzer capability separately from missing semantic vocabulary. Do not amend the kernel merely to improve one project's ranking.

### Final verification

```bash
npm test
node --test test/scanners/implementation-graph.test.js
node --test test/scanners/referent-binding.test.js test/scanners/cross-representation.test.js
node --test test/system-model/anchor-lift.test.js test/system-model/anchor-diff.test.js
node --test test/system-model/anchor-projection.test.js test/system-model/renderer.test.js
```

Also verify:

- native and WASM produce equivalent canonical models;
- serial and forced-worker scans produce equivalent canonical models;
- cached and uncached scans agree after the extractor-version bump;
- repeated scans and projections are deterministic;
- snapshot/diff explicitly reject the old model schema and work after recreating the baseline;
- the private graph does not appear in persisted objects or `/api/model`;
- Kalakar scan budgets terminate with explicit partial coverage rather than hanging or silently dropping paths.

## Completion criterion

This plan is complete when Varai can open Kalakar at a subject-oriented overview, recover `BuildingModel` through deterministic evidence, keep its distinct actions separate, trace one representative action through its interfaces and implementation to source, expose unresolved analysis honestly, and preserve those semantics across a helper-only refactor and a meaningful contract/effect change.

Prompt consolidation, intent reconciliation, LLM explanation, authoring from the System Model, broader framework coverage, and generalized runtime state-machine recovery remain out of scope.
