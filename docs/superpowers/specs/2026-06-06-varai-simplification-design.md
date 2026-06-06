# Varai Simplification — Design Spec
_2026-06-06_

## Context

Varai started as an intent-coverage audit tool: give it an intent file and a repo, get a report on what's present vs. missing. The code works but the project feels twisted — too many overlapping docs, too many concepts (profiles, links, checks, facets, archetypes, evidence layers, residual logs), and a trajectory that requires a lot of independent thinking to maintain.

The pivot: **Varai is a lens, not an auditor.** The primary moment it serves is "show me my app" — scan a repo and produce a clean, evidence-linked inventory a developer can read to orient themselves. One command, no intent file required. Capability coverage can return later as an optional layer once the lens proves useful.

---

## What changes

### Command

```
varai map [<repo-path>]        # defaults to .
varai map ../kalakar
varai map ../kalakar --include services/backend --include services/frontend/src
varai                          # shows help (no default subcommand)
```

No `--intent` flag. No requirements. No diff. `varai audit` is removed from the CLI for Phase 1 — the subcommand simply won't exist until the capability layer returns in Phase 3.

### Output

A clean markdown inventory organized by category. Each line traces to a file.

```
# App Map — kalakar

## API Routes (12)
  POST /api/auth/login          services/backend/routes/auth.py:24
  GET  /api/projects            services/backend/routes/projects.py:8
  POST /api/plans/:id/undo      services/backend/routes/plans.py:41

## Data Models (8)
  User          services/backend/models/user.py:12
  Project       services/backend/models/project.py:6

## Frontend Stores (3)
  planStore     services/frontend/src/store/planStore.js:1

## Packages
  fastapi, sqlalchemy, alembic, python-jose
  react, vite, react-router, zustand

## Env Vars
  DATABASE_URL, JWT_SECRET, VITE_API_BASE
```

No verdicts, no scoring, no gap analysis. Pure inventory.

---

## Scanner architecture

The scanner becomes a registry of per-stack extractors behind a stack-detection step. This is the seam that lets ast-grep slot in later without touching consumers.

```
src/scanners/
  index.js            — orchestrator: detect stacks → run extractors → merge facts
  stack-detect.js     — reads marker files (pyproject.toml, vite.config.*, next.config.*, package.json deps)
  extractors/
    nextjs.js         — existing repo.js logic, moved verbatim (Next.js/Prisma/Supabase)
    fastapi.js        — @app/@router decorator routes (regex, heuristic)
    sqlalchemy.js     — class X(Base) / __tablename__ patterns (regex, heuristic)
    react-vite.js     — react-router routes, Zustand create() files
    python-common.js  — pyproject.toml/requirements.txt packages; os.environ vars
```

Each extracted fact carries an `evidence.layer` tag that states *how honestly* it was found:

- `"ast"` — confirmed by a tree-sitter parse tree (routes, models, stores, React routes). A parser established the node is real, so no false positives from comments, strings, or multiline formatting.
- `"heuristic"` — read from a path convention, a manifest file, or a text scan (Next.js path-based routes, Prisma schema, package lists, env-var names). Reliable enough for inventory, not parser-verified.
- `"semantic"` — **reserved for Phase 2.** Resolved across files by SCIP (the edges of the structural graph).

The renderer never needs to know which layer produced a fact; the tag just lets the report be honest about confidence. Mixed layers in one map is expected and correct — the tag tells the truth about each line.

**Scope filtering:** `--include <path-prefix>` (repeatable). Lets you target `services/backend` without scanning large irrelevant subtrees (e.g., kalakar's 30K-file geometry engine).

**File extensions added:** `.py`, `.toml`  
**Ignored dirs added:** `__pycache__`, `.venv`, `venv`, `.pytest_cache`, `.mypy_cache`

**Existing golden scenarios stay green** — `nextjs.js` is a verbatim move of the current `repo.js`.

---

## What stays, what gets cut, what gets deferred

| | |
|---|---|
| **Stays** | `src/capabilities.js`, `examples/golden/`, `src/scanners/repo.js` (→ moved to `extractors/nextjs.js`) |
| **Cut from default path** | `src/intent.js`, `src/matcher.js`, intent-coverage reporter |
| **Replaced** | `src/reporters/markdown.js` → new inventory renderer |
| **Deferred** | `varai audit` (intent coverage) — can return as a second subcommand; tree-sitter / ast-grep extraction |
| **Docs collapsed** | 8 overlapping docs deleted/archived; one clear `README.md` replaces them |

The docs to delete: `varai-build-plan.md`, `varai-action-plan.md`, `architecture.md`, `evidence-model.md`, `roadmap.md`, `plan-intent-extraction.md`, `product.md`, `development.md`, `sample-report.md`.  
The docs to keep: `docs/spec.md` (rewritten), `docs/adr/`.

---

## Extraction engine strategy

The map's only value is trust. Regex over raw source lies the moment a route is multiline, decorated through a variable, or sitting in a comment — so the new extractors parse, they don't pattern-match raw text.

**Phase 1 (now) — tree-sitter, altitude 1 (syntax facts).** The new Python/React extractors parse with tree-sitter (via `web-tree-sitter` + prebuilt `tree-sitter-wasms` grammars — WASM, no native compilation). The pattern: use a stable query to isolate the real node (`(decorator)`, `(class_definition)`, a `<Route>` element), then read the identifying parts from that *parser-validated* node. A small pattern run on an isolated, confirmed decorator node is not "regex again" — the parser already ruled out comments, strings, and multiline breakage; we just read the method and path out of a node we know is real. Facts are tagged `layer: "ast"`.

The existing Next.js extractor stays as-is (path conventions + manifest reads) tagged `layer: "heuristic"` — its routes come from *where files sit* (`app/api/x/route.ts`), which is a reliable framework convention, not a lying heuristic. No reason to rewrite working, golden-locked code for purity.

**Phase 2 — SCIP, altitude 2 (the structural graph).** Tree-sitter is syntax-honest, not behavior-honest: it sees `@router.get("/x")` but cannot tell you that handler *writes* the `User` model in another file, because that needs following names across files — symbol resolution. That is SCIP's job. Run `scip-python` / `scip-typescript` / `scip-clang` (yes, C++); each emits the *same* index format of every symbol, definition, and reference. Consume one uniform index regardless of language to draw the edges. SCIP gives the *reference* graph for free; read/write *direction* (an INSERT/`.commit()` on a resolved model symbol = a write) is a thin interpretation layer Varai owns on top. Facts there are tagged `layer: "semantic"`.

Note: `web-tree-sitter` and SCIP are different altitudes of one stack — tree-sitter locates nodes cheaply; SCIP resolves the edges between them. ast-grep is *not* a separate step — it is tree-sitter with a CLI, same altitude as Phase 1.

Host language stays **JavaScript**.

---

## Phasing

**Phase 1 — Lens, altitude 1 (this spec)**
- `varai map` command
- Extractor registry + kalakar stack extractors (tree-sitter for Python/React, `layer: "ast"`)
- Inventory renderer
- Docs collapse
- Run on kalakar, observe output, adjust
- *ast-grep trigger watch:* the moment you stop trusting the counts (a route registered in a loop, via a variable) is the signal you've hit the syntax ceiling and need Phase 2.

**Phase 2 — The structural graph, altitude 2 (SCIP)**
- SCIP indexers (`scip-python`, `scip-typescript`, `scip-clang`) as the cross-language semantic backbone
- Draw edges: "this route writes this model, which this page reads"
- Read/write direction as a thin layer over resolved symbols
- This is the real "PL above the assembly" — connections made legible, not just a flat list

**Phase 3 — Names, altitude 3 (only if intent is supplied)**
- Naming a cluster ("this *is* authentication") is **not** recoverable from code alone — it was destroyed at generation time.
- If wanted, Varai must take intent as an input here; `capabilities.js` re-enters as the matcher. The honesty wall sits below this layer — do not let the tool invent names silently.

**Submodule wiring** in jodulabs happens after Phase 1 is working — a separate 10-minute git operation.

---

## Verification

1. `npm test` — existing golden scenarios pass (Next.js extractor move didn't regress anything)
2. `node bin/varai.js map ~/dreamLand/jodulabs/kalakar --include services/backend --include services/frontend/src` — produces a real inventory with FastAPI routes, SQLAlchemy models, Zustand stores, packages, env vars — each line with a file reference
3. Eyeball the output: every line must trace to a real file; no invented entries; the kalakar routes/models/stores you know exist must appear
4. `node bin/varai.js map .` on the Varai repo itself — produces its own map (routes: none, packages: node, etc.)
