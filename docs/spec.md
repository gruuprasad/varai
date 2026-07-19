# Varai Spec

## Product contract

`varai map <repo>` builds and renders a local, deterministic, evidence-backed System Model. It describes software above implementation level while keeping every statement traceable to repository evidence and every analyzer limit explicit.

Varai does not require an intent file or an LLM and never uploads repository contents silently.

## Canonical pipeline

```text
local repository
  -> scope-aware file walk and stack detection
  -> parser observations and behavior analysis (private)
  -> System Model v1 (the only product IR)
       -> current-system map
       -> snapshots and semantic diff
       -> later: checks, intent reconciliation, constrained explanation
```

Private observations may be cached for performance. They are not exposed by the scanner, stored in semantic snapshots, or independently versioned. Pre-release snapshots from discarded models are intentionally ignored and regenerated.

## System Model v1

The model contains one System, registered Subsystems, stable Elements, typed Claims, analyzer Coverage, and Diagnostics. The vocabulary is defined in `docs/semantic-language.md`.

Element identity derives from subsystem, kind, and semantic key. Claim identity derives from source, relationship, and semantic slot or target. Source paths, evidence, confidence, qualifiers, and analyzer versions do not define semantic identity.

Framework-specific analyzers may use private intermediate shapes, but they must translate them before the scanner boundary. Adding framework support must not require a new kernel object type, snapshot payload, or diff engine.

## Honesty and coverage

Every Element and Claim declares evidence, observation method, claim state, and responsible capability. Coverage is one of:

- `analyzed`: relevant constructs in scope were handled;
- `partial`: supported shapes were handled but known gaps remain;
- `unsupported`: the area was recognized without a supporting analyzer;
- `failed`: an expected analyzer did not complete.

Absence may be stated only under analyzed coverage. Analyzer-version changes and coverage changes are not silently presented as application changes.

## Parser and performance contract

Parsing remains behind `src/scanners/treesitter.js` with native and WASM backends. Cached/uncached, serial/worker, and native/WASM scans must produce canonical byte-identical System Model JSON.

The per-file observation cache key includes `EXTRACTOR_VERSION` in `src/scanners/cache.js`. Bump it whenever extraction logic changes.

## Snapshot and diff contract

Snapshot manifest v1 stores one content-addressed `modelObjectHash`, its `modelSchemaVersion`, Git state, scanned-tree hash, and scan-configuration hash. The configuration hash covers include and exclude scope. Clean snapshots update the shared Git commit ref; linked worktrees share the model store at `.varai/model-v1/`.

Diff compares two validated System Models and separates semantic changes from evidence-only movement. It reports Element, Claim, Coverage, and confidence changes using stable semantic identities.

## Non-goals

- exhaustive language/framework coverage;
- runtime correctness without runtime evidence;
- intent recovery from implementation;
- hosted repository analysis;
- LLM-created findings;
- architecture diagrams before model evidence stabilizes.
