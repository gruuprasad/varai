# System Model IR Vertical Slice Plan

> Status: Superseded. This temporary parallel-model implementation was removed in favor of the single System Model architecture recorded in ADR 0004 and `docs/spec.md`.

Status: Ready for implementation  
Date: 2026-07-18

## Outcome

Introduce Varai's framework-neutral System Model as a parallel, versioned product model; project the knowledge Varai already recovers into it; make `varai map` render that model in system language; and persist it beside Analysis IR v2 without breaking the existing snapshot, diff, or dashboard paths.

This slice implements product-alignment Milestone 0 and a thin Milestone 1. It deliberately does not add new framework extraction, refactor scanners into semantic adapters, implement System Model diff, redesign the dashboard, or add an LLM interpreter.

## Findings recorded before implementation

### Application logic

API, UI, CLI, and Worker elements are entry points, not the whole application. Meaningful internal logic is represented as a Behavior when it has a stable system-level meaning: a use case, workflow, reusable operation, decision, orchestration, or state-changing operation.

Use the Application lens for these behaviors. Interfaces may `invoke` Application behaviors. Do not promote every function, class, handler helper, or call-graph node. Analysis IR v2 does not yet contain sufficiently stable internal boundaries, so its compatibility projector will not manufacture Application elements in this slice.

### AI systems

AI software fits the existing kernel structurally. Model, Prompt, Context, Memory, Tool, Guardrail, Agent, and Evaluation are lens-specific Element kinds; the existing `accepts`, `requires`, `reads`, `invokes`, `produces`, `changes`, `emits`, and `fails_with` relationships remain sufficient.

The AI lens remains provisional until the language is tested against one direct LLM or agent application. Static analysis may report configured models/providers, prompt and context sources, exposed tools and permissions, memory stores, invocation wiring, guardrails, fallbacks, and evaluations. It must not claim model correctness, instruction following, deterministic output, successful tool execution, or reliable termination without corresponding evidence.

AI vocabulary therefore stays out of the kernel and out of the initial built-in lens registry.

## Architectural boundary

The migration is parallel rather than a rename:

```text
source observations
  -> Analysis IR v2 (existing compatibility and diff payload)
  -> compatibility projector
  -> System Model v1 (new product payload)
       -> system-language map
```

Analysis IR v2 is coupled to HTTP/UI doors and fixed clause arrays. The System Model uses generic Elements and Claims so Worker, CLI, Data, Library, Application, and future lenses do not require changes to the kernel or persistence layer.

## System Model v1

```js
{
  schemaVersion: 1,
  analyzerVersion: "0.1.0",

  system: {
    id,
    key: "repository-root",
    name
  },

  subsystems: [{
    id,
    key,
    lens,
    name,
    qualifiers: {},
    evidence: []
  }],

  elements: [{
    id,
    subsystemId,
    key,
    kind,
    roles: [],
    name,
    qualifiers: {},
    evidence: [],
    observationMethod,
    claimState,
    capability
  }],

  claims: [{
    id,
    sourceId,
    relation,
    target: { kind: "reference", id },
    // or { kind: "literal", valueType, value }
    slot,
    qualifiers: {},
    evidence: [],
    observationMethod,
    claimState,
    capability
  }],

  coverage: [{
    id,
    analyzerId,
    analyzerVersion,
    capability,
    scopeId,
    state,
    evidence: [],
    details: []
  }],

  diagnostics: [{
    code,
    severity,
    message,
    analyzerId,
    capability,
    scopeId,
    evidence: []
  }]
}
```

All collections are canonicalized and sorted. Evidence supports a repository-relative `file` plus optional `line`, `symbol`, and `manifestKey`.

### Vocabulary and registries

The kernel owns the closed relationship vocabulary from `docs/semantic-language.md`, generic roles (`interface`, `behavior`, `resource`), claim states, observation methods, and coverage states.

A separate lens registry owns subsystem labels, allowed Element kinds, and renderer terms. Initial registered lenses are API, UI, Worker, CLI, Data, Service, Library, and Application. Tests must be able to supply a synthetic lens registry without changing kernel code.

Qualifiers are flat objects with lower-snake-case keys and scalar or scalar-array values. Nested AST/framework payloads are invalid. The initial framework-neutral registry includes `platform`, `storage`, `http_status`, `event`, `direction`, `cardinality`, `condition`, `delivery`, `application_state`, `optionality`, `execution_mode`, `timeout`, `queue`, and `concurrency`.

### Identity rules

- System ID derives from `repository-root`, not the checkout directory name.
- Subsystem ID derives from System ID plus its lens key.
- Element ID derives from Subsystem ID, Element kind, and an adapter/projector-supplied semantic key.
- Element name, qualifiers, evidence, confidence, and analyzer version never participate in identity.
- Claim identity derives from source ID, relationship, and either a supplied semantic slot or the target identity.
- Claim qualifiers, evidence, confidence, capability, and analyzer version never participate in identity.
- A reference target is identified by target ID. A literal target is identified by normalized `valueType + value` when no semantic slot exists.
- Source paths must not appear in semantic keys when a stable system boundary exists.
- Identity collisions produce explicit diagnostics; core code must not silently add a path to make an ID unique.

The compatibility projector uses these keys:

- API operation: normalized HTTP method plus mounted path;
- UI component: exported component name within the UI subsystem;
- UI action: component name plus normalized event/action;
- Data resource: resource kind plus recovered contract/entity/store name;
- CLI command: runner plus command name;
- Service process: recovered service/process name.

## Analysis v2 compatibility projection

Implement one pure projector. Do not change extractors in this slice.

### Elements and claims

- HTTP behavior becomes one API operation Element with `interface` and `behavior` roles. The API subsystem `exposes` it.
- `takes`, `gives`, `requires`, `reads`, `writes`, and `fails` become `accepts`, `produces`, `requires`, `reads`, `changes`, and `fails_with` Claims.
- Existing `writes` never becomes `creates` or `removes`; Analysis IR v2 cannot prove that distinction.
- `untraced` clauses become diagnostics, not positive semantic Claims.
- A UI component becomes a UI interface Element. Its action becomes a Behavior Element that the component `offers`; the action is `triggered_by` its event.
- A `disabled_when X` guard becomes `available_when not(X)` without inventing a friendly business condition.
- `schema`, `db_model`, and `state_store` facts become Data contract, entity, and state Resource Elements.
- References from behavior clauses reuse matching Data Elements; unresolved targets remain typed literals rather than invented resources.
- `page` facts become UI screen/interface Elements.
- `script` facts become CLI command Elements with `interface` and `behavior` roles.
- `service` facts become Service process Elements.
- API route facts merge with matching API operation behaviors instead of creating duplicates.
- Pattern instances, packages, integrations, and environment variables remain in Analysis IR for this slice rather than being forced into weak System Model Claims.

Literal names are normalized mechanically only. The projector does not invent domain meaning.

### Coverage

Add an explicit compatibility capability table:

- FastAPI behavior tracer: `api.operation`, `api.input`, `api.output`, `api.condition`, `api.effect`, `api.failure`;
- React interaction tracer: `ui.action`, `ui.availability`;
- schema/model/store extractors: `data.contract`, `data.entity`, `data.state`;
- runnable extractor: `cli.command`, `service.process`.

All compatibility-projected capabilities initially report `partial`. Running today's extractor proves that supported shapes were inspected, not that every relevant construct was understood. Existing trace failures produce `failed` coverage for the affected capability and retain their diagnostic.

Coverage identity is analyzer ID + capability + scope ID. Analyzer version and evidence are excluded. Duplicate coverage merges conservatively:

1. any `failed` record yields `failed`;
2. all `analyzed` yields `analyzed`;
3. all `unsupported` yields `unsupported`;
4. every other mixture yields `partial`.

Evidence and details are unioned canonically. A renderer must never turn `partial` or `unsupported` coverage into “none found” or “no change.”

## Persistence and compatibility

- `scanRepo()` returns both `analysis` and `systemModel`.
- Snapshot manifest format advances to v2.
- A v2 manifest retains `semanticObjectHash` and adds `systemModelObjectHash` plus `systemModelSchemaVersion`.
- Snapshot identity includes both object hashes.
- The content-addressed object store remains payload-agnostic.
- Existing v1 manifests remain readable.
- Snapshot selectors recognize snapshot ID, Analysis object hash, and System Model object hash.
- `runDiff()` and dashboard progression continue consuming `semanticObjectHash` until System Model diff is implemented.
- `runSnapshot()` reports both object hashes.
- Historical Analysis objects are not silently converted into persisted System Models.
- Analysis IR version and analyzer version remain unchanged. No extractor cache bump is needed because extractor logic is unchanged.

## Current-system renderer

Add a deterministic renderer and make it the primary `varai map` output. It shows:

- system name and subsystem summary;
- sections for populated subsystem lenses;
- Elements grouped using lens vocabulary;
- canonical claim sentences with evidence citations;
- explicit partial, unsupported, and failed coverage.

Keep `renderInventory()` intact as the existing technical/evidence renderer. Do not redesign the dashboard in this slice.

## Implementation sequence

### 1. Align the product contract

- Add `docs/adr/0004-system-model-is-the-product.md`.
- Add the Application and provisional AI findings to `docs/semantic-language.md` and `docs/semantic-language-real-world-validation.md`.
- Rewrite `docs/spec.md` around observations -> System Model -> projections.
- Replace the stale phase sequence in `docs/roadmap.md` with the validated System Model milestones.
- Update `CONTEXT.md` with System, Subsystem, Element, Interface, Behavior, Resource, Claim, Lens, Adapter, and Coverage.
- Mark the original product-shape statements in ADR 0001 and ADR 0003 as superseded by ADR 0004 while preserving their local-first, evidence, honesty, vendor-neutral, Git-boundary, and dogfood decisions.

### 2. Build the kernel

Add:

- `src/system-model/version.js`
- `src/system-model/schema.js`
- `src/system-model/identity.js`
- `src/system-model/canonicalize.js`
- `src/system-model/validate.js`
- `src/system-model/merge.js`
- `src/system-model/lenses.js`
- `src/system-model/qualifiers.js`

Keep these files free of framework names and framework-specific shapes.

### 3. Build the compatibility projector

Add:

- `src/system-model/projectors/analysis-v2.js`
- `src/system-model/projectors/coverage.js`

The projector accepts a completed Analysis IR v2 plus repository display metadata and returns a validated System Model. It has no filesystem or parser dependency.

### 4. Integrate scanning

Update `src/scanners/index.js` after Analysis IR construction to project and validate `systemModel`, then return both payloads without changing existing result fields.

### 5. Render the system view

- Add `src/reporters/system-model-markdown.js`.
- Update `src/map.js` so `varai map` renders `scan.systemModel`.
- Preserve `renderInventory()` and its unit tests.

### 6. Persist both models

Update:

- `src/snapshots/store.js`
- `src/snapshots/snapshot.js`
- `src/snapshots/selectors.js`
- `src/semantic-commands.js`

Keep the Analysis-v2 differ and dashboard progression paths unchanged.

### 7. Add conformance and acceptance tests

Add focused tests under `test/system-model/` for schema, identity, canonicalization, merge, projection, coverage, and rendering. Add a generic multi-subsystem fixture under `test/fixtures/system-model-app/`, and extend scanner parity and snapshot tests.

## Required verification

- Repeated model creation is byte-identical.
- Evidence order and duplicate projector input do not change output.
- Moving HTTP/UI evidence leaves Element and Claim IDs stable.
- Changing a qualifier leaves Claim ID stable.
- Changing an unslotted literal target is remove/add; changing a slotted target keeps Claim identity stable for the later differ.
- Identity collisions emit diagnostics.
- The backend output-contract dogfood scenario projects one added `produces` Claim.
- The frontend loading-guard scenario projects one added `available_when` Claim.
- The generic fixture populates API, UI, Data, CLI, and Service sections.
- Partial and failed coverage are visible in Markdown.
- Native/WASM, serial/worker, cached/uncached scans produce identical System Model JSON.
- Old snapshot manifests remain readable; new snapshots contain both payload hashes.
- Existing Analysis IR, snapshot, diff, server, and dashboard tests continue to pass.
- A synthetic lens can be validated through an injected registry without kernel edits.
- Kernel modules contain no FastAPI, React, Kalakar, or AI vocabulary.
- `npm test` passes.

## Completion criterion

`varai map` presents an evidence-backed system overview using the new neutral model, including the two known Kalakar dogfood behaviors, while existing snapshot and diff behavior remains backward-compatible.

After this slice is dogfooded, the next implementation step is the semantic-adapter contract and honest capability coverage—not System Model diff yet.
