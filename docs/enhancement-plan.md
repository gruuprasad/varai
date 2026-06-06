# varai map — Comprehensive Enhancement Plan

## Context

`varai map` scans a repo and prints an "App Map" inventory (API routes, pages, models, migrations, stores, packages, env vars). Running it on the `kalakar` repo surfaced four problems:

1. **It's slow.** Every Python file is read 3× and parsed 5–6× — each `queryCaptures()` call does a fresh `new Parser()` + `parse()` (treesitter.js:38), and the three Python extractors (fastapi, sqlalchemy, python-common) each re-walk and re-parse every `.py`. There is no tree cache, no Parser reuse, and the extractor loop is fully sequential.
2. **Garbled output.** `inventory.js:30` renders `name.padEnd(42) + loc`. When a route name exceeds 42 chars (most do), there is *no separator*, so the name mashes into the path: `…/glbservices/backend/routes/asset_catalog.py`.
3. **Wrong route paths.** Routes show the local decorator path (`POST /login`) not the mounted path. In kalakar `app.include_router(auth.router, prefix="/api/auth")` means the real path is `POST /api/auth/login`. Confirmed dominant pattern; `building_model.router` is mounted at `/api/v1` and recursively re-includes ~16 sub-routers.
4. **Missing coverage.** "Packages" lists only Python deps (no npm). No frontend API calls, components, hooks, Pydantic settings, or `.env`/`VITE_` env vars. Also `.worktrees/` (present in kalakar) isn't ignored, so worktree `.env` copies pollute results.

Goal: faster scans, accurate mounted route paths, broader extraction, and clean scannable output. User opted into the **comprehensive** scope (all four areas).

## Important constraints (verified)

- **No map golden file exists.** `examples/golden/*` belong to the separate intent feature. The map renderer is tested only by `test/inventory.test.js` via `out.includes(...)` substring checks. Preserve those substrings (`# App Map — <name>\n` prefix, `## API Routes (N)`, `## Packages`, `## Env Vars`, `routes/auth.py:24`, `POST /api/auth/login`, etc.) and the existing extractor/scanner/map tests, which call `extract(repoPath, files)` directly.
- **Extractor contract `extract(repoPath, files) -> Fact[]` must stay back-compatible.** Add an optional 3rd `ctx` arg with a default, never break the 2-arg call.
- Fact shape: `{ kind, name, evidence: [{file, line?}], layer }`.

## Implementation

### Phase 1 — Parse cache + execution model (perf first)

- **`src/scanners/treesitter.js`**: add a reusable `Parser` per language and a `Query` cache `Map<lang, Map<queryString, Query>>`. Export `parseTree(lang, code)` and `queryTree(tree, lang, queryString)`. Reimplement `queryCaptures(lang, code, q)` as `queryTree(await parseTree(lang, code), lang, q)` so all current callers/tests are unchanged.
- **New `src/scanners/context.js`**: `createScanContext(repoPath, {maxBytes=500_000})` → `{ repoPath, read(file), tree(file, lang), prefixMap }`. `read` memoizes `readFile` with the existing size guard (returns null if too big/missing); `tree` memoizes per `(file, lang)`. This is the shared content+tree cache so the same `.py` is parsed once across all three Python extractors.
- **4 extractors**: change to `extract(repoPath, files, ctx = createScanContext(repoPath))`; replace inline `stat`/`readFile` with `await ctx.read(file)` and `queryCaptures(lang, content, q)` with `queryTree(await ctx.tree(file, lang), lang, q)`. Route python-common's TOML parse through `ctx.tree(file, "toml")` (removes its inline `new Parser()`). With the default ctx, disk/parse behaviour per file is identical → unit tests pass.
- **`src/scanners/index.js` `scanRepo`**: build one `ctx`, pass to every `extractFn(repoPath, files, ctx)`. Add `.worktrees` to `IGNORED_DIRS`. Keep `files.sort()` and sequential parsing for deterministic output; optionally prefetch `ctx.read` with bounded concurrency (reads only).
- **`.gitignore` in `walk()`**: new option `gitignore` (default true). Lazy `await import("ignore")`, read root `.gitignore`, filter `rel` via `ig.ignores(rel)`; degrade silently if the package is missing. v1 = root `.gitignore` only. **Requires `npm install ignore`** (a new dependency).

### Phase 2 — New extractors / fact kinds

- **npm packages** — new `src/scanners/extractors/npm.js`: read root + `services/frontend/package.json`, collect `dependencies`+`devDependencies` keys → `{kind:"package", ecosystem:"npm", name, evidence:[{file}], layer:"ast"}`. Register under the `react-vite` stack. Tag python-common's existing package facts with `ecosystem:"python"`.
- **Frontend API calls** (extend `react-vite.js`) — kind `api_call`: `fetch("…")` and `axios.<verb>("…")`/`axios("…")` with a **string-literal** URL → `name = "<VERB?> <url>"`, evidence file+line. Skip dynamic/template URLs.
- **Components & hooks** (extend `react-vite.js`) — kinds `component` / `hook`, scoped tightly to avoid noise: **exported** symbols only, only files under `*/components/`, `*/pages/`, `*/hooks/`. Component = exported PascalCase fn/const; hook = exported `/^use[A-Z]/`. Dedupe by name+file.
- **Settings & .env** — in python-common: `class X(BaseSettings)` attributes → new kind `settings_field`. Parse `.env`/`.env.*` files line-wise (`^KEY=`) → `env_var` with line evidence (gitignore + `.worktrees` keep worktree copies out). In react-vite: `import.meta.env.VITE_X` → `env_var` `VITE_X`. `env_var` stays unified.

### Phase 3 — Route prefix accuracy (semantic)

- **New `src/scanners/router-prefix.js`**: `buildPrefixMap(files, ctx) -> Map<module, prefix>`. Resolve same-file imports (`from routes import auth` → `routes/auth.py`; `from routes.x.y import router as y_router` → that file). Handle `APIRouter(prefix="/x")` declarations, `app.include_router(<alias>.router, prefix="/p")`, and **recursively** `router.include_router(<sub>_router)` (kalakar's building_model mounts ~16 sub-routers under `/api/v1` with no inner prefix). Accumulate prefixes down the tree.
- **`fastapi.js`**: after extracting a local route, look up the file's module in `ctx.prefixMap`; if resolved, prepend the prefix and set `layer:"semantic"`; else keep the local path with `layer:"ast"`. `scanRepo` builds the prefix map once and attaches it to `ctx`. The fastapi unit test (no scanRepo, no map) gets no prefix → unchanged. Never emit a confident wrong path; fall back to local when unresolved.

### Phase 4 — Presentation (`src/reporters/inventory.js`)

- **Fix padEnd**: two-column writer — if `name.length < COL`, `name.padEnd(COL) + "  " + loc`; else put `loc` on the next indented line. Preserves both asserted substrings regardless of layout.
- **Summary header** (below line 1, so `startsWith("# App Map — <name>\n")` holds): detected stacks, file count, per-section counts. **Guard every field defensively** — `inventory.test.js` calls `renderInventory({scan:{facts}})` with no `summary`/`stacks`; missing fields must not throw.
- **New sections** appended: API Calls (`api_call`), Components (`component`, capped — e.g. show count + note if >60), Hooks (`hook`), Settings (`settings_field`). **Packages** stays one `## Packages` section, sub-grouped into `python: …` / `npm: …` lines via the `ecosystem` field (keeps `## Packages` + both package-name substrings).
- `scanRepo` return extended additively: `{ summary:{fileCount, factCount, stacks, sectionCounts}, stacks, files, facts }`. `map.js` already forwards the whole `scan`.

## Critical files

- `src/scanners/treesitter.js` — parse/query cache (perf core)
- `src/scanners/context.js` *(new)* — shared content+tree cache
- `src/scanners/index.js` — wire ctx, `.worktrees`, gitignore
- `src/scanners/router-prefix.js` *(new)* — prefix resolution
- `src/scanners/extractors/{fastapi,react-vite,python-common,npm}.js`
- `src/reporters/inventory.js` — layout fix, header, new sections
- `package.json` — add `ignore` dependency
- `docs/spec.md` — document new kinds (`api_call`, `component`, `hook`, `settings_field`, npm `package`) and semantic-layer routes

## Tests

- Existing `test/extractors/*.test.js`, `test/map.test.js`, `test/scanner.test.js`, `test/inventory.test.js` must pass **unchanged** (back-compat default ctx + defensive header + substring-safe layout).
- Add: npm/api_call/component-scoping/BaseSettings/.env/VITE_ extractor tests; inventory tests (package ecosystem split, new sections, long-name layout); scanner gitignore + `.worktrees` skip; `test/router-prefix.test.js` (resolution + fallback + recursive include); treesitter cache-hit test.

## Verification

1. `npm install ignore` then `node --test` — all green.
2. `node bin/varai.js map ../kalakar` — routes show `/api/v1/building-model/...` and `/api/auth/login` (semantic), npm + python packages both listed, `.worktrees`/gitignored files absent, no column collisions, summary header present.
3. `time node bin/varai.js map ../kalakar` before vs after — expect a large drop (each `.py` parsed once, not 5–6×).
4. `--include services/backend` and `--include services/frontend/src` — scoping still holds.

## Risks

- **`ignore` dependency** needs install; lazy import degrades gracefully if absent but the lockfile changes.
- **Component noise** — biggest output-quality risk; mitigated by path-scope + export-only + render cap; tune against kalakar.
- **Prefix correctness** — re-aliased/nested imports only partially handled; always fall back to local, tag `semantic` only when resolved, never emit a confident wrong path.
- **Output stability** — low (substring tests, no map golden); the real trap is the defensive summary header against `inventory.test.js`'s `scan` lacking `summary`/`stacks`.
