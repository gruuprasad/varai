# Varai Spec

`varai map <repo>` scans a repo and outputs a structured inventory of what it contains. One command, no configuration, no intent file.

## Pipeline

```
local repo
  -> files (walker, scope-filtered, gitignore-aware)
  -> stack detection (marker files)
  -> facts (per-stack extractors, shared parse cache)
  -> route prefix resolution (cross-file semantic)
  -> inventory (renderer)
  -> stdout
```

## Fact types

| Kind | Source | Layer |
|---|---|---|
| `api_route` | FastAPI `@router.*` / `@app.*` | `ast` (local) / `semantic` (prefix-resolved) |
| `webhook_route` | route path matches `/webhook/` | same as parent route |
| `page` | react-router `<Route path=...>` | `ast` |
| `db_model` | SQLAlchemy `class X(Base)` | `ast` |
| `database_migration` | Alembic `versions/*.py` | `heuristic` |
| `state_store` | Zustand `create()` files | `ast` |
| `package` | `pyproject.toml` / `package.json` deps | `ast` |
| `env_var` | `os.environ["X"]`, `os.getenv("X")`, `.env` files, `import.meta.env.VITE_*` | `ast` / `file` / `heuristic` |
| `api_call` | `fetch("...")`, `axios.<verb>("...")` (string-literal URLs) | `heuristic` |
| `component` | exported PascalCase fn/const in `*/components/`, `*/pages/`, `*/hooks/` | `ast` |
| `hook` | exported `use[A-Z]` functions in `*/components/`, `*/pages/`, `*/hooks/` | `ast` |
| `settings_field` | Pydantic `BaseSettings` class attributes | `ast` |

Every fact may also carry an optional `stock: string[]` field — a list of stock pattern names (`auth`, `payment`, `file_storage`, `email`, `notifications`, `settings`, `health`) it matches. Populated by a post-merge derived pass. See `docs/superpowers/specs/2026-06-07-varai-stock-catalog-design.md`.

### Ecosystem tagging

`package` facts carry an `ecosystem` field (`"python"` or `"npm"`). The inventory renderer groups packages by ecosystem in the `## Packages` section.

### Route prefix resolution

When `fastapi` stack is detected, `src/scanners/router-prefix.js` builds a prefix map from cross-file import analysis:
- Resolves `app.include_router(x.router, prefix="/p")` to mounted file
- Resolves recursive `router.include_router(sub)` chains
- Combines `APIRouter(prefix="/x")` own prefixes with mounted prefixes

Routes with resolved prefixes are tagged `layer: "semantic"`; unresolved routes keep `layer: "ast"` with the local decorator path.

## Evidence layers

- `"ast"` — produced from a tree-sitter parse tree
- `"semantic"` — cross-file resolution (route prefixes)
- `"heuristic"` — regex-based extraction on source text (api calls, VITE_ env vars)
- `"file"` — direct file content parsing (.env files)

## Performance

- Shared `Parser` cache per language (reused across files and extractors)
- Shared `Query` cache per `(lang, queryString)` 
- Shared content+tree cache via `ScanContext` — each `.py` is parsed once across all three Python extractors

## Walk behavior

- `.worktrees/` is ignored alongside standard cache/virtualenv directories
- Root `.gitignore` patterns are honored (requires `ignore` npm package)
- `--include` scoping is applied at the walk level before extraction

## Direction

Phase 1 (this): flat inventory, altitude 1, all tree-sitter + semantic route prefixes.
Phase 2: structural graph via SCIP — "this route writes this model, which this page reads."
Phase 3: capability names, only with supplied intent — not recoverable from code alone.

## What it is not

Not a code reviewer, security scanner, test coverage tool, or AI Q&A tool.
