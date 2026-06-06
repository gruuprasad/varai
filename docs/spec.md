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
| `api_route` | FastAPI `@router.*` / `@app.*` | `ast` |
| `webhook_route` | route path matches `/webhook/` | same as parent route |
| `page` | react-router `<Route path=...>` | `ast` |
| `db_model` | SQLAlchemy `class X(Base)` | `ast` |
| `database_migration` | Alembic `versions/*.py` | `ast` |
| `state_store` | Zustand `create()` files | `ast` |
| `package` | `pyproject.toml` deps | `ast` |
| `env_var` | `os.environ["X"]`, `os.getenv("X")` | `ast` |

## Evidence layers

All facts are `"ast"` — produced from a tree-sitter parse tree. Comments, strings, and multiline formatting are excluded at the parser level, not by regex. No heuristics remain in the active path.

`"semantic"` — reserved for Phase 2 (SCIP cross-file resolution).

## Direction

Phase 1 (this): flat inventory, altitude 1, all tree-sitter.
Phase 2: structural graph via SCIP — "this route writes this model, which this page reads." SCIP indexers (`scip-python`, `scip-typescript`, `scip-clang`) produce a uniform symbol index across languages; Varai reads the edges. Facts tagged `"semantic"`.
Phase 3: capability names, only with supplied intent — not recoverable from code alone.

## What it is not

Not a code reviewer, security scanner, test coverage tool, or AI Q&A tool.
