# Varai System Model Product Roadmap

## Product decision

Varai's product is a local, evidence-backed **system-level model of a repository**. It lets a builder understand what the system does without reading implementation code or running every workflow.

The current-system view, semantic progression, checks, and optional English explanation are projections over that model:

```text
repository
  -> language/framework adapters
  -> Varai System Model
       -> current-system view
       -> semantic diff
       -> checks
       -> optional constrained English interpretation
```

AST parsing, Git, and LLMs are supporting mechanisms:

- AST and manifests provide deterministic evidence.
- Git supplies snapshot boundaries and incremental invalidation.
- An optional LLM may explain proven model changes, but never creates them.

## User questions the model must answer

- What are the major parts of this system?
- What can each part do?
- What triggers a behavior?
- What enters and comes out?
- What conditions apply?
- What state or external systems does it affect?
- How can it complete or fail?
- What changed since another checkpoint?
- What could Varai not determine?

## Model shape

Use one framework-neutral kernel with subsystem-specific lenses.

```text
System
├── subsystems: API, UI, Worker, CLI, Data, Services, Library
├── elements: operations, screens, actions, jobs, commands, entities
├── relationships
│   ├── triggered_by
│   ├── accepts / produces
│   ├── requires / available_when
│   ├── reads / writes
│   ├── calls / navigates_to / emits
│   └── fails_with
├── evidence and claim state
└── analyzer coverage
```

Each lens translates the kernel into natural system language:

- API: endpoint, request, response, authorization, failure.
- UI: screen, control, user action, state, navigation, feedback, qualified by platform.
- Worker: trigger, job, consumed data, produced artifact, status.
- CLI: command, arguments, output, exit outcome.
- Data: entity, contract, relationship, persistence.
- Services: process, dependency, exposed interface.

Facts remain the smallest source observations and evidence drill-down. They are no longer the primary product surface.

## Kalakar without overfitting

Kalakar is the first serious acceptance project because it supplies real API, UI, data, scripts, services, and asynchronous work. It validates whether the model changes a real development decision.

It must not define the core vocabulary.

Rules:

1. No `kalakar`, construction-domain term, FastAPI, React, or handler convention such as `onClose` appears in core IR, diff, persistence, or generic rendering.
2. Every Kalakar-derived capability first gets a small fixture named after the system concept, not the application task.
3. Framework syntax is translated inside an adapter; adding an adapter must not require changes to the System Model or differ.
4. The same relationship recovered from different frameworks serializes identically.
5. Every lens needs a non-Kalakar conformance fixture. Before declaring a lens stable, prove it with a second implementation style or framework where practical.
6. Unsupported touched constructs produce coverage diagnostics, never an unqualified “no semantic change.”
7. A source move does not change system identity when the externally meaningful boundary is unchanged.

## Roadmap

### Milestone -1 — Validate the semantic language

Treat `docs/semantic-language.md` as the normative product-language draft. Before designing System Model storage, manually encode its ten validation scenarios and at least one unrelated synthetic project using only the proposed primitives and relationships.

For each scenario, record:

- canonical claims;
- evidence and claim state;
- coverage boundary;
- system-language rendering;
- semantic diff rendering;
- any missing or redundant primitive.

Exit criterion: the API, UI, Worker, CLI, Data, Library, and cross-subsystem examples read naturally without framework-specific kernel terms, and any vocabulary change satisfies the language-change rule.

Status: completed in `docs/semantic-language-validation.md` and `docs/semantic-language-real-world-validation.md`. Synthetic scenarios plus Trux, date-fns, Temporal Python samples, and Jaffle Shop passed. The real-world pass renamed Web UI to platform-qualified UI, added a Library lens, and did not require a new kernel relationship.

### Milestone 0 — Align the product contract

Record the clarified decision before further analyzer work.

Deliverables:

- Add an ADR: “The system model is the product; map, diff, checks, and explanation are projections.”
- Rewrite `docs/spec.md` around the model-building pipeline.
- Replace the stale build sequence in `docs/roadmap.md` with these milestones.
- Extend `CONTEXT.md` with System, Subsystem, Element, Relationship, Lens, Adapter, and Coverage.
- Mark the superseded parts of ADR 0001 and ADR 0003 explicitly; preserve local-first, evidence, honesty, and vendor-neutral decisions.

Exit criterion: a contributor can explain Varai without leading with facts, FastAPI, semantic diff, or an LLM.

### Milestone 1 — System Model v3 vertical slice

Introduce the new model alongside Analysis IR v2 rather than performing a big-bang replacement.

Recommended schema:

```json
{
  "schemaVersion": 1,
  "analyzerVersion": "...",
  "subsystems": [],
  "elements": [],
  "relationships": [],
  "coverage": [],
  "diagnostics": []
}
```

An element owns stable identity, subsystem, kind, name, and evidence. A relationship owns source element, typed relation, reference-or-literal target, evidence, observation method, and claim state. Evidence never participates in relationship identity.

Build a compatibility projector from current observations:

- FastAPI behaviors -> API operation elements and relationships.
- React UI actions -> UI action elements and relationships.
- Schema/model/state facts -> Data elements.
- Script facts -> CLI command elements.
- Compose/Docker facts -> Service elements.

Do not add new framework extraction in this milestone. First prove the model can represent what Varai already knows.

Critical code areas:

- new `src/system-model/` schema, identity, canonicalization, validation, and projection modules;
- `src/scanners/index.js` to return both current Analysis IR and the System Model during migration;
- snapshot manifests/object store to persist the model version explicitly;
- focused fixtures under `test/fixtures/system-model/`.

Exit criteria:

- Kalakar produces populated API, UI, Data, CLI, and Services sections.
- The existing backend output-contract and frontend loading-guard scenarios serialize as generic relationships.
- Repeated, cached/uncached, native/WASM, and serial/worker runs are canonical and identical.
- No model identity depends on line number; move behavior has an explicit test.

### Milestone 2 — Adapter contract and coverage

Replace scanner-level FastAPI/React branches with registered semantic adapters.

Adapter contract:

```text
repository context
  -> elements
  -> relationships
  -> capability manifest
  -> coverage observations
  -> diagnostics
```

Each adapter declares stable ID, version, detected stack, supported capabilities, and relevant file/syntax scope. The core merges adapter output and detects collisions.

Initial capability vocabulary should be system-oriented, for example:

- `api.operation`, `api.input`, `api.output`, `api.condition`, `api.failure`
- `ui.screen`, `ui.action`, `ui.availability`, `ui.navigation`, `ui.feedback`
- `data.entity`, `data.contract`, `data.persistence`
- `cli.command`, `worker.job`, `service.process`

Coverage must distinguish:

- observed capability;
- supported but not found;
- partially analyzed;
- unsupported or ambiguous construct;
- analyzer failure.

Exit criteria:

- FastAPI and React use the same adapter output contract.
- Adding a fake/conformance adapter requires registry changes only, not edits to the model, differ, or snapshot store.
- “No semantic changes” is qualified with analyzed coverage.
- Unsupported changes are visible in JSON, Markdown, and dashboard.

### Milestone 3 — Current-system interface

Make the system model—not facts or progression—the default CLI/dashboard experience.

Primary navigation:

```text
Overview | API | UI | Workers | CLI | Data | Services | Libraries | Progression | Coverage
```

Each element view answers the common questions using lens-specific vocabulary and links every claim to evidence. Facts and raw Analysis IR become an advanced evidence view.

Start with:

- `varai map` rendering the system view in Markdown;
- dashboard overview and subsystem navigation;
- API operation and UI action detail;
- Coverage panel showing supported, partial, and unknown areas.

Exit criterion: during a Kalakar task, the current-system view lets the user locate the relevant behavior and understand its contract without opening code or running the app.

### Milestone 4 — System Model diff

Diff elements and relationships, not framework-specific clause arrays.

Change algebra:

- subsystem/element added or removed;
- relationship added or removed;
- claim confidence changed;
- evidence moved;
- coverage changed;
- possible rename/move reported separately when identity is ambiguous.

Keep the existing snapshot/worktree machinery and migrate its payload to the System Model. Provide a temporary v2 renderer compatibility layer until all existing tests move.

Exit criteria:

- Both completed Kalakar dogfood tasks render as one relationship change on one stable element.
- Moving code without changing its boundary is evidence-only.
- An analyzer-version or coverage change is never presented as an application change without a warning.

### Milestone 5 — Prove breadth deliberately

Add structurally different lenses before deeply expanding Kalakar-specific API/UI recognition.

Recommended order:

1. CLI commands, seeded from existing npm/Python/Make observations.
2. Worker/job triggers from one Python convention plus a generic fixture.
3. Data contracts and relationships from existing schema/model observations.
4. A second API adapter (for example Express) to prove API neutrality.
5. A second UI implementation style only after the UI model stabilizes.

For every new capability:

```text
generic before/after fixture
  -> adapter conformance test
  -> model snapshot assertion
  -> semantic diff assertion
  -> real Kalakar acceptance scenario when applicable
```

Exit criterion: at least three subsystem lenses and two implementations of one lens produce the same relationship vocabulary without core changes.

### Milestone 6 — Optional English interpreter

Only after the deterministic current-system view is useful, add an opt-in interpreter over System Model JSON.

Constraints:

- It receives model elements/relationships, not arbitrary source code.
- Every sentence must cite relationship or element IDs.
- Varai validates all cited IDs.
- It cannot assert intent, causality, correctness, or unchanged behavior unless represented in the model and coverage.
- Deterministic rendering remains the source of truth and fallback.
- Remote model use is explicit and off by default to preserve local-first behavior.

Exit criterion: removing the LLM changes readability only, never the underlying findings or diff.

## Pre-implementation design gate

Complete Milestone -1 before implementation. Do not let the current Analysis IR field names determine the System Model schema.

## First implementation plan

After the semantic language passes its validation suite, implement Milestones 0 and 1 as the next vertical slice.

1. Write the product ADR and update vocabulary/spec/roadmap.
2. Define System Model v1 in `src/system-model/` with schema validation and canonical identities.
3. Project existing facts and HTTP/UI behaviors into subsystem elements and typed relationships.
4. Attach an initial coverage record derived from active extractors; do not yet claim syntax-level completeness.
5. Return and persist the System Model alongside Analysis IR v2.
6. Add a deterministic Markdown system renderer; leave the dashboard redesign for Milestone 3.
7. Add a generic multi-subsystem fixture plus Kalakar acceptance assertions.
8. Keep existing CLI/diff output compatible during the migration.

This slice is complete when `varai map ../kalakar` begins with a system overview and the two known dogfood behaviors appear in system language, while all existing tests and snapshot/diff commands remain valid.

## Verification strategy

- Unit tests: schema validation, identity, canonicalization, relationship deduplication, coverage states.
- Projection tests: existing HTTP/UI behavior objects become framework-neutral elements and relationships.
- Golden test: generic API + UI + CLI + Data + Service fixture.
- Compatibility tests: current inventory and semantic diff remain stable during migration.
- Parity: native/WASM, serial/worker, cached/uncached produce identical System Model JSON.
- Move test: change file/evidence location without semantic add/remove.
- Kalakar acceptance: snapshot current clean main, inspect system overview, then replay the two known before/after commits.
- Anti-overfit audit: core `src/system-model/` contains no framework or Kalakar vocabulary; adapter-only changes are sufficient for a synthetic second framework.

## Deferred

- Deep whole-program dataflow and runtime correctness.
- Intent reconciliation and steering.
- Generic architecture diagrams.
- Hosted repository upload.
- LLM-first discovery or explanation.
- Exhaustive language/framework coverage.
