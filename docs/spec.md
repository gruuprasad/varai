# Varai Spec

## Product contract

`varai map <repo>` builds and renders a local, deterministic, evidence-backed System Model. The user-facing result describes the system above implementation level while keeping every claim traceable to source and every analyzer limit explicit.

Varai does not require an intent file or an LLM. It does not upload repository contents silently.

## Pipeline

```text
local repository
  -> scope-aware file walk and stack detection
  -> language/framework observations
  -> Analysis IR v2 (migration evidence payload)
  -> System Model v1
       -> current-system Markdown
       -> snapshots
       -> later: semantic diff, checks, intent reconciliation
```

During the migration slice, existing FastAPI/UI behavior objects and facts are projected into System Model v1. Later semantic adapters will emit the same model contract directly.

## System Model v1

The model contains:

- one System;
- Subsystems identified by registered lenses;
- stable Elements with lens-specific kinds and generic interface/behavior/resource roles;
- typed Claims using the relationship vocabulary in `docs/semantic-language.md`;
- evidence, observation method, and claim state;
- analyzer capability coverage and diagnostics.

Element identity derives from subsystem, kind, and a semantic key. Claim identity derives from its source, relationship, and semantic slot or target. Source paths, evidence, confidence, qualifiers, and analyzer versions do not define semantic identity.

## Current compatibility input

Analysis IR v2 remains the existing structured observation payload:

- facts and stock-pattern instances;
- HTTP and UI behavior cards;
- state locations and bundle views;
- diagnostics and intent-artifact hashes.

It remains the payload consumed by the existing differ until System Model diff ships. Historical Analysis objects are never silently reinterpreted as System Models.

## Coverage contract

Coverage attaches to an analyzer capability and System/Subsystem/Element scope:

- `analyzed`: relevant constructs in scope were handled;
- `partial`: known supported shapes were handled but gaps remain;
- `unsupported`: the area was recognized without a supporting analyzer;
- `failed`: an expected analyzer did not complete.

Compatibility-projected capabilities are initially `partial`; today's extractors do not prove exhaustive syntax coverage. Absence may be stated only under analyzed coverage.

## Parser and performance contract

Parsing remains behind `src/scanners/treesitter.js` with native and WASM backends. Both satisfy the same node-shape contract. Cached and uncached, serial and worker, and native and WASM scans must produce canonical byte-identical model JSON.

The per-file cache key includes `EXTRACTOR_VERSION` in `src/scanners/cache.js`. Bump it whenever extractor logic changes. Projection/model-only changes do not require a cache bump.

## Snapshot contract

Snapshot manifests are Git-bound and content-addressed. Manifest v2 stores both:

- `semanticObjectHash`: Analysis IR v2 for existing diff/dashboard compatibility;
- `systemModelObjectHash`: System Model v1 for the current-system product and later model diff.

Clean snapshots update the shared Git commit ref; linked worktrees share the semantic object store. Older manifest v1 files remain readable.

## Non-goals for the current slice

- exhaustive language/framework coverage;
- runtime correctness or behavioral guarantees;
- intent recovery from implementation;
- hosted repository analysis;
- LLM-created findings;
- architecture diagrams before model evidence stabilizes.
