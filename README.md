# Varai

A lens for your codebase. Run `varai map` and get a clean inventory of what your repo contains — routes, models, stores, packages, env vars — each traced to a source file.

## Install

```bash
npm install -g .
```

## Usage

```bash
varai map                           # map current directory
varai map ../kalakar                # map another repo
varai map ../kalakar --include services/backend --include services/frontend/src
```

## Output

```
# App Map — kalakar

## API Routes (12)
  POST /api/auth/login              services/backend/routes/auth.py:24
  GET  /api/projects                services/backend/routes/projects.py:8

## Data Models (8)
  User                              services/backend/models/user.py:12

## Frontend Stores (3)
  planStore                         services/frontend/src/store/planStore.js

## Packages
  fastapi, sqlalchemy, alembic, python-jose, react, vite, zustand

## Env Vars
  DATABASE_URL, JWT_SECRET, VITE_API_BASE
```

## Stacks detected

| Stack | What's extracted |
|---|---|
| Next.js | pages, API routes (`app/` and `pages/`), Prisma models, Supabase migrations |
| FastAPI | decorator routes (`@router.get`, `@app.post`, etc.) via tree-sitter |
| SQLAlchemy | `class X(Base)` model classes via tree-sitter; Alembic migration files |
| React/Vite | `<Route path=...>` pages, Zustand `create()` stores via tree-sitter |
| Python | pyproject.toml packages, `os.environ`/`os.getenv` vars |

## Evidence layers

Every fact is tagged with how it was found:
- `ast` — a tree-sitter parse tree confirmed the node (routes, models, stores)
- `heuristic` — file-path convention or manifest parsing (Next.js routes, packages, env var names)

## Development

```bash
npm test
```

Golden scenarios in `examples/golden/` lock the Next.js extractor. Add new scenarios there to lock new extractor behaviour.
