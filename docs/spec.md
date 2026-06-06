# Varai Spec

`varai map <repo>` scans a repo and outputs a structured inventory of what it contains. One command, no configuration, no intent file.

## Pipeline

```
local repo
  -> files (walker, scope-filtered)
  -> stack detection (marker files)
  -> facts (per-stack extractors)
  -> inventory (renderer)
  -> stdout
```

## Fact types

| Kind | Source | Layer |
|---|---|---|
| `api_route` | FastAPI `@router.*` / Next.js `app/api/*/route.ts` | `ast` / `heuristic` |
| `webhook_route` | route path matches `/webhook/` | same as parent route |
| `page` | Next.js `app/*/page.tsx`, react-router `<Route path=...>` | `ast` / `heuristic` |
| `db_model` | SQLAlchemy `class X(Base)`, Prisma `model X {}` | `ast` / `heuristic` |
| `database_migration` | Alembic `versions/*.py`, Supabase `migrations/` | `heuristic` |
| `state_store` | Zustand `create()` files | `ast` |
| `package` | `package.json` deps, `pyproject.toml` deps | `heuristic` |
| `env_var` | `process.env.X`, `import.meta.env.X`, `os.environ["X"]` | `heuristic` |

## Evidence layers

- `"ast"` — a tree-sitter parse tree node confirmed the fact. Comments, strings, and multiline formatting are excluded at the parser level, not by regex.
- `"heuristic"` — derived from file-path conventions or manifest text. Reliable for framework conventions; not parser-verified.
- `"semantic"` — reserved for Phase 2 (SCIP cross-file resolution). Not emitted yet.

## Direction

Phase 1 (this): flat inventory, altitude 1.
Phase 2: structural graph via SCIP — "this route writes this model, which this page reads." SCIP indexers (`scip-python`, `scip-typescript`, `scip-clang`) produce a uniform symbol index across languages; Varai reads the edges. Facts tagged `"semantic"`.
Phase 3: capability names, only with supplied intent — not recoverable from code alone.

## What it is not

Not a code reviewer, security scanner, test coverage tool, or AI Q&A tool.
