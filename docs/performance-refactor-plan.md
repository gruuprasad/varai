# varai `map` Performance Refactor

## Context

`varai map <repo>` scans a repo and prints an "App Map" inventory of facts (API routes, components, hooks, env vars, packages…). Profiling on **kalakar** (387 files) showed **~5s wall-clock**, of which **~90% of CPU is tree-sitter WASM parsing**. Breakdown: react-vite ~3.7s, fastapi ~1.3s, python-common ~0.7s. Queries, file-walking, and stack detection are negligible. The warm run is no faster than cold because the only cache (`treeCache`/`readCache` in `context.js`) is in-memory per-run, and the run uses only ~109% CPU (fully serial).

This refactor implements four improvements, sequenced so each is independently shippable and keeps all 91 tests green. Goal: near-instant warm re-runs and multi-core cold runs, with **byte-identical output**.

**Approved decisions (from user):** per-file *fact* cache (trees aren't serializable); worker pool sharded **by file**; cache + parallelism **on by default** (flags to disable).

## Phasing

| Phase | Item | Default | Risk |
|------|------|---------|------|
| **A** | Regex-skip: avoid parsing when only regex facts are needed | on | low |
| **B** | Persistent on-disk per-file fact cache (`.varai/cache/`) | on (`--no-cache` off) | med |
| **C** | Worker pool, file-sharded (`--jobs N`, default `cpus-2`) | on for large repos | med-high |
| **D** | Native tree-sitter backend (swappable, default) | **on** — wasm is fallback | dep/build |

Build A→B→C→D. A shrinks the parse surface B caches and C parallelizes. D swaps the parse backend to native bindings (the largest constant-factor win) with wasm retained as an automatic fallback.

## Key architecture facts driving the design

- **Extractor signature is a hard contract**: `extract(repoPath, files, ctx = createScanContext(repoPath))`. Tests call extractors directly as `extract(dir, [files])`. **Preserve this signature** — all new machinery hooks in at `scanRepo`/`ctx`, never at the extractor boundary. Calling an extractor with a 1-element `files` array is valid (they loop + filter internally).
- **Facts are pure JSON** (`{kind,name,evidence:[{file,line?}],layer,ecosystem?}`) — confirmed serializable for both disk cache and worker transfer. Trees never leave an extractor.
- **`prefixMap` is the one global cross-file structure** — built in `scanRepo` from ALL python files before fastapi runs (`router-prefix.js`, pure line-regex, ~280ms, no WASM). Only `fastapi.js` consumes it. It stays main-thread and is serialized into workers.
- **`dedupeFacts`** (`utils.js`) keeps the **first** `kind:name` occurrence → order-sensitive. So the merge must **sort first, then dedupe**.
- **Ordering today is implicit**: `walk` sorts files; extractors iterate sorted; `EXTRACTOR_MAP` fixed order; `groupByKind` preserves insertion order. Confirmed **no test asserts raw fact-array order**. Components are capped at 60, so ordering decides *which* 60 render — an explicit deterministic sort is required for stable output under parallelism/caching.

## Phase A — Regex-skip restructuring

Produce **identical facts**, but skip a tree parse when a file only yields regex-derived facts. Add conservative `content.includes(...)` pre-parse guards (skip parse only when a fact is provably impossible).

**`src/scanners/extractors/react-vite.js`** (the big win):
- Read `content` first (move the read above the parse).
- Run `api_call` (lines ~57-77) and vite `env_var` (lines ~79-87) regex over `content` — **no tree**.
- **Fix line 104**: pass `content` into `extractComponentsAndHooks` instead of `tree.rootNode.text` (identical string; removes redundant source rebuild and decouples component/hook detection from the AST — it's regex-only).
- Parse **only if** `content.includes("zustand")` (store) or `content` contains `<Route`/`\bRoute\b` (JSX pages) — these are the only AST consumers. Otherwise skip the parse entirely.
- Net: a `fetch`+`VITE_*` file with no JSX/zustand → **zero parses**; component files with no `<Route`/zustand → zero parses; real JSX-route/zustand files → still parse, same facts.

**Other extractors** (keep AST, add guards):
- `fastapi.js`: skip parse if `content` lacks `@app.`/`@router.`. Decorator AST detection stays (needed to avoid matching routes in comments — guarded by existing test).
- `sqlalchemy.js`: skip parse if `content` lacks `class ` or `Base`. Migration path-fact unchanged.
- `python-common.js`: skip python parse if `content` lacks `os.environ`/`os.getenv`/`BaseSettings`. TOML + `.env` paths unchanged.
- `npm.js`: untouched (already `JSON.parse`).

## Phase B — Persistent per-file fact cache

New `src/scanners/cache.js`: `createFactCache({ cacheDir, formatVersion, extractorVersion, stacks, prefixFingerprint, enabled })` →
- `keyFor(relFile, content)` — SHA-256 (`node:crypto`) over: `CACHE_FORMAT_VERSION` + `EXTRACTOR_VERSION` + content hash + sorted stack set + **prefixMap fingerprint** (SHA-256 of sorted `[...prefixMap]`, folds the one cross-file dependency into the key so a fastapi name resolved under an old router topology invalidates even when its route file is byte-identical; constant for non-fastapi repos).
- `get(relFile, content)` → `facts[] | null` (always null if `!enabled`).
- `set(relFile, content, facts)` → atomic write (`<hash>.json.tmp-<pid>` then `rename`; safe under concurrent worker writers).
- Invalidation is **implicit** — changed content → different key → automatic miss.
- Cache unit = **whole-file fact set** (union of all extractors for that file), matching the parse-once reality (a `.py` file is shared by fastapi/sqlalchemy/python-common).

**On-disk layout** under `<repoPath>/.varai/cache/` (already gitignored + in `IGNORED_DIRS`):
```
facts/<first2hex>/<fullhash>.json   # {v, hash, file, facts:[...]}
```

**Hook point — restructure `scanRepo` to per-file** (shared with Phase C):
1. `walk` → `detectStacks` → build `prefixMap` (main thread) → compute `prefixFingerprint`.
2. For each sorted `file`: `extractFileAll(repoPath, file, ctx, stacks, prefixMap)`:
   - `content = ctx.read(file)`; cache `get` → hit returns facts with **no parse** (the warm-run win).
   - miss → run each relevant extractor as `extractFn(repoPath, [file], ctx)`, concat, `cache.set`.
3. Concat all per-file facts → **global sort** (below) → `dedupeFacts` → summary → return.

`python-common`'s old cross-file dedupe is restored by the global post-merge `dedupeFacts` (key ignores file/evidence) — covered by a test.

**Deterministic ordering** (applied to serial, cached, and worker paths alike): sort by `kindRank` (the fixed section order in `inventory.js:14-25`) → `evidence[0].file` → `evidence[0].line` → `name`, **then** dedupe. Output becomes a pure function of file contents + stacks.

All cache `get`/`set` wrapped in try/catch → **non-fatal** on read-only FS/CI; degrade to no-cache.

## Phase C — Worker pool, file-sharded

- `src/scanners/pool.js`: spawn `N = max(1, cpus-2)` workers; shard the sorted file list (round-robin, or greedy by `stat.size`); dispatch, collect, merge.
- `src/scanners/worker.js`: rehydrate `ctx`, set `ctx.prefixMap = new Map(prefixEntries)`, run `extractFileAll` over its slice, post back **facts arrays** (never trees). Each worker has its own `treesitter` caches (fresh module context — expected) and reads/writes the fact cache directly (disjoint shards → no key contention; atomic rename safe).
- **Message in**: `{ repoPath, files:[slice], stacks, prefixEntries, cacheConfig }`. **Message out**: facts array + slice id.
- Main merges → same global sort + dedupe → identical report regardless of scheduling.
- **Auto-disable** (run serial in main) when: `--jobs 1`, or `cpus-2 <= 1`, or `files.length < ~64` (avoids worker-spawn + per-worker WASM-init cost on small repos/golden fixtures).
- **Crash/unsupported-env fallback**: a worker `error`/non-zero `exit` → re-run that shard serially in main; `Worker` construction failure → fully serial. Never drop a file's facts.

## Phase D — Native backend (default, wasm fallback)

Refactor `treesitter.js` into a facade selecting a backend implementing `{init, loadLanguage, parseTree, queryTree}`, preserving the current exported names (so no extractor/test changes):
- `backends/native.js` — `tree-sitter` + native grammars (`tree-sitter-python`, `-typescript`, `-javascript`, `-toml`), **the default**. Largest constant-factor win; native parse is several× faster than WASM.
- `backends/wasm.js` — current `web-tree-sitter` + `tree-sitter-wasms` impl, **automatic fallback** when native fails to load (missing build toolchain / ABI mismatch): warn once to stderr, then run on WASM. Never hard-fail over a backend.
- Select with `--parser native|wasm` / `VARAI_PARSER`; default is native. Workers inherit the choice. Node-shape contract extractors rely on (`childForFieldName`, `namedChildren`, `startPosition.row`, `.text`, `.type`) must hold for both — guarded by a parity test asserting identical facts across backends.

**Dependencies:** add `tree-sitter` + the four native grammar packages. They need a `node-gyp` toolchain at install and are ABI-bound to the Node version. AGENTS.md updated to record native bindings as a justified exception to "built-ins first" (parse throughput is the tool's dominant cost), with wasm retained as the portable fallback. Make the native packages `optionalDependencies` so install still succeeds (falling back to wasm) on machines without a build toolchain.

## CLI / flags

Extend `bin/varai.js parseMapOptions` (and `usage()`): `--jobs <N>`, `--no-cache`, `--cache-dir <path>`, `--parser <native|wasm>` (D). Thread through `runMap` (`map.js`) → `scanRepo` (`index.js`). CLI overrides `varai.config.json` (mirror existing `include` precedence). All optional; absent → default behavior.

## Files

**Create:** `src/scanners/cache.js` (B), `src/scanners/worker.js` + `src/scanners/pool.js` (C), `src/scanners/backends/wasm.js` + `backends/native.js` (D), `test/cache.test.js` + `test/worker-parity.test.js` + `test/regex-skip.test.js`.

**Modify:** `src/scanners/index.js` (per-file dispatcher + cache + pool + global sort, thread options), `src/scanners/extractors/{react-vite,fastapi,sqlalchemy,python-common}.js` (A guards), `src/scanners/treesitter.js` (facade, D), `src/scanners/context.js` (expose content alongside tree; keep API), `src/map.js` + `bin/varai.js` (options/flags), `AGENTS.md` (document `EXTRACTOR_VERSION` bump rule + native-parser policy).

**Reuse unchanged:** `dedupeFacts` (`utils.js`), `buildPrefixMap` (`router-prefix.js`), `createScanContext` (`context.js`), `detectStacks`, `renderInventory`/`groupByKind`.

## Verification

- **Baseline:** `npm test` → 91 pass (confirmed). Re-run green after each phase.
- **Cache (no timing flakiness):** scan twice → identical facts; assert a hit by **stubbing the parse backend to throw** — if facts still return for unchanged files, every file was a hit. Modify one file → only that file re-parses. Bump `EXTRACTOR_VERSION` → full miss. Change a router-include file so a byte-identical route file's prefix changes → cached fastapi name updates (proves prefix fingerprint in key). `--no-cache` → no writes / always miss.
- **Worker parity:** same repo with `--jobs 1` vs `--jobs 4` → **deep-equal facts + byte-identical report**. Repeat `--jobs 4` → byte-identical each run (determinism). Same env var in two python files → exactly one `env_var` fact in both modes. Inject a throwing worker → facts equal serial (fallback).
- **Regex-skip parity:** `react-vite` file with `fetch`+`VITE_*`, no JSX/zustand → facts equal pre-refactor **and** parse never called (spy); a JSX/zustand file **does** parse. Existing `react-vite` tests cover fact-equality.
- **Parser parity (D):** same repo with `--parser native` vs `--parser wasm` → **deep-equal facts + byte-identical report**. Force native-load failure (e.g. unset/rename the native module) → run falls back to wasm with a single stderr warning, still succeeds.
- **End-to-end + perf:** `node bin/varai.js map /home/gp/dreamLand/jodulabs/kalakar` → cold run faster than ~5s baseline (native backend should beat wasm severalfold on the parse-dominated phases); immediate warm re-run near-instant; output byte-identical to a `--jobs 1 --no-cache --parser wasm` run. `npm run map:example` unchanged.
