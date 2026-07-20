# Backend Semantic Closure — Implementation Plan

**Date:** 2026-07-20  
**Status:** Ready to implement  
**Depends on:** `2026-07-19-anchor-based-lift-design.md`, `2026-07-19-semantic-assembly-acceptance-corpus.md`

## Goal

Make an already-resolved UI-to-API system path terminate in the domain subject and outcomes that
the backend implementation proves:

```text
Structural Basis Types panel
  -> Apply change
  -> PUT /building-model/.../structural-types/...
  -> changes BuildingModelDocument
  -> may fail because the preview is required or stale
```

The path may remain two public Behavior steps. Backend helpers stay private implementation
evidence unless a later increment independently proves that one is a stable Application Behavior.

## Current evidence and diagnosis

The live Kalakar scan contains 676 Behavior frames, 49 `invokes` Claims, and 30 resolved system
paths. All 30 paths contain two Behavior steps; only one has any subject. Most of their terminal API
frames report `changes file`, `changes unknown`, or no effect.

The frontend-to-API join is therefore working for these 30 paths. The dominant failure is backend
semantic closure: the tracer loses value identity through untyped wrappers, returned values,
higher-order function arguments, and nested callbacks. The current structural acceptance fixture
uses directly typed helpers, so it does not reproduce the real failure.

## Design rules

- Keep one canonical System Model and the existing relationship vocabulary.
- Extend the private implementation analysis; do not expose raw call-graph nodes as system paths.
- A complete path is measured by **semantic closure**, not hop count: its terminal frame has a
  resolved subject or outcome supported by evidence.
- Use bounded abstract values, not general Python execution or full SSA.
- Never select a dependency/context merely because it is the only typed argument.
- A persistence helper acting on a resolved aggregate proves an aggregate effect. Its underlying
  generic file write remains implementation evidence unless a stable file/artifact identity is
  itself observable.
- Ambiguous callable or value bindings remain explicit and downgrade coverage; they are never
  resolved by name similarity.
- Preserve semantic identity across helper rename/split refactors. New value-flow evidence may
  change `implementationPath`, not Behavior identity.

## Gate 1 — Replace the optimistic fixture with the real call shape

Extend the structural semantic-assembly fixture to include:

```python
def route(ctx: JobContext, request: Request):
    document = ensure_document(ctx)              # unannotated wrapper
    return mutate(ctx, document, update_type)     # callable passed as a value

def mutate(ctx, document, operation):             # untyped parameters
    def callback(current_document):               # closure
        return operation(current_document)
    return apply_mutation(ctx, document, callback)
```

Add a second equivalent fixture that renames/splits private wrappers, and a negative fixture with
two possible callable targets.

Assertions:

- the API frame changes `BuildingModelDocument`;
- `JobContext`, `file`, and `unknown` are not primary subjects;
- the UI-to-API path is semantically closed on `BuildingModelDocument`;
- the implementation path includes the endpoint, wrappers, callback, and domain operation;
- helper refactoring changes evidence only;
- ambiguous callable flow yields a diagnostic and no invented subject.

Critical files:

- Modify `test/fixtures/semantic-assembly-structural/`
- Modify `test/system-model/semantic-assembly-structural.test.js`
- Add focused fixtures/tests under `test/behaviors/`

## Gate 2 — Add bounded call-context binding

Introduce a small private value-flow module used by the Python behavior tracer. Its abstract value
domain needs only:

- declaration references (for example `BuildingModelDocument`);
- callable references (for example `update_structural_type`);
- tuples/unions of the above when flow is ambiguous;
- unknown, with reason and evidence.

For each resolved call:

1. Match positional and keyword arguments to callee parameters.
2. Evaluate simple argument expressions: identifiers, constructors, resolved calls, and tuple
   members.
3. Seed the callee environment with those abstract values, overriding absent annotations while
   retaining annotation evidence when present.
4. Trace the callee under a context key of function identity plus a canonical binding signature.
5. Carry closure bindings into nested functions.
6. When an invoked identifier names a uniquely bound callable parameter, follow that callable.
7. Terminate cycles and enforce the existing work/depth budgets. Unsupported `*args`, dynamic
   dispatch, or multiple callable targets produce stable diagnostics.

Do not globally cache a function summary without its binding signature; the same helper may act on
different aggregate types at different call sites.

Critical files:

- Add `src/scanners/behaviors/value-flow.js`
- Modify `src/scanners/behaviors/body.js`
- Modify `src/scanners/behaviors/symbol-index.js`
- Modify `src/scanners/lift/implementation-graph.js` only if call edges need binding evidence
- Extend `test/behaviors/body-effects.test.js`
- Extend resolver/symbol-index tests

## Gate 3 — Propagate returns and bind effects to their owning subject

Add the minimum return analysis required to preserve an aggregate through wrappers:

- a constructor returns its declaration;
- an annotated function return remains a declaration candidate;
- `return identifier` returns the identifier's current abstract value;
- `return call(...)` returns the resolved callee result;
- assignment receives the returned abstract value;
- tuple return/unpacking is supported where the tuple shape is statically visible.

Use these values when classifying effects:

- mutation through a typed or call-bound aggregate parameter becomes `changes <aggregate>`;
- a higher-order operation called with that aggregate contributes its effect to the enclosing API
  Behavior;
- persistence of that aggregate remains `changes <aggregate>` with the write operation in its
  `implementationPath`;
- ORM query-result identity flows through local variables so `db.delete(row)` can become
  `removes PasswordResetToken`;
- local/intermediate mutations that do not escape or persist are not public system effects.

Keep the first implementation centered on the structural mutation path, but implement these as
language-level rules rather than Kalakar symbol lists.

Critical files:

- Modify `src/scanners/behaviors/body.js`
- Modify `src/scanners/behaviors/effects.js`
- Modify `src/scanners/lift/bindings.js`
- Modify `src/scanners/lift/index.js`
- Extend `test/behaviors/body-effects.test.js`
- Extend `test/system-model/anchor-projection.test.js`

## Gate 4 — Make closure and uncertainty visible

Keep `systemPaths()` as a projection over public `invokes` Claims, but add derived completeness:

- `closed`: terminal frame has at least one resolved effect subject or explicit outcome;
- `partial`: it has useful terminal claims plus unresolved effect/call diagnostics;
- `open`: it stops at an interface with no resolved subject or outcome.

Frames must separate:

- primary subject effects;
- supporting/infrastructure evidence;
- unresolved effects.

Do not add judgment, intent comparison, or LLM narration. Presentation should say what Varai
resolved and where the chain remains open.

Critical files:

- Modify `src/system-model/projections/behavior-frames.js`
- Modify `src/system-model/projections/system-paths.js`
- Modify `src/reporters/system-model-markdown.js`
- Modify `src/ui/app.js`
- Extend projection and renderer tests

## Gate 5 — Dogfood against the five-path corpus

Run a clean Kalakar scan and record, for each corpus scenario:

| Scenario | Required result for this increment |
|---|---|
| Apply structural type | Closed on `BuildingModelDocument`; no primary `file`/`JobContext` subject |
| Create project | Measure only; use the result to choose the next resolver shape |
| Render building model | Measure aggregate read and artifact gaps separately |
| Reset password | Measure field mutation and query-result deletion gaps separately |
| Export plan | Measure callback-prop and artifact gaps separately |

This increment succeeds when the structural path passes because of generic value-flow rules and
at least one additional corpus path improves without a scenario-specific rule. Do not broaden the
implementation merely to make all five pass in one change.

Record before/after metrics:

- resolved UI-to-API paths;
- paths closed on a subject/outcome;
- reference-bound versus literal effects;
- `file` and `unknown` effect counts;
- infrastructure objects appearing as primary subjects;
- analyzer diagnostics by unsupported flow shape.

## Versioning and verification

- Bump `EXTRACTOR_VERSION` with the tracer change.
- Bump `SYSTEM_MODEL_ANALYZER_VERSION`; the kernel/schema version should not change.
- Keep native/WASM and serial/worker parity.
- Run focused behavior, projection, renderer, and semantic-diff tests.
- Run `npm test`, syntax checks, and `git diff --check`.
- Run `varai map ../kalakar --no-cache` and inspect the structural path in both Markdown data and
  dashboard JSON.
- Treat comparisons to an older analyzer snapshot as analyzer evolution, not repository
  progression. Hardening snapshot comparability remains the following independent increment.

## Explicitly deferred

- promoting application operations into public Behaviors;
- adding backend helper calls as public `invokes` Claims;
- full Python dataflow/SSA or runtime tracing;
- frontend callback-prop and hook tracing;
- artifact identity and download modeling;
- intent, prompts, judgment, or LLM narration;
- another visual redesign.

After this increment, review the closed path in Kalakar. Promote an Application Behavior only if
the endpoint frame still hides a durable operation a user would independently name and inspect.
