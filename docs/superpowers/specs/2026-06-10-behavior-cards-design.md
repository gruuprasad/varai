# Behavior Cards and Bundles — v1 (FastAPI backend)

Status: draft for review
Date: 2026-06-10

## Purpose

This feature is an experiment with a product surface, in that order. The hypothesis it tests: **the behavior is Varai's construct** — the unit above code level that is (a) recoverable from code, (b) meaningful to a human without reading code, and (c) checkable. Facts are atoms; stock tags are labels; the behavior is the first thing with a boundary, an interface, and well-formedness.

A behavior is what a user can poke: a front door (route, page, script, worker handler) plus the contract observable from outside — what it takes, what it gives, what it requires, what it touches, what it changes, how it fails. The model for the reader experience is a **library spec**: nobody reads a library's code; they read "call this, it does that" and are satisfied. Varai shows the owner their own app the way a library shows itself to its users.

v1 scope: FastAPI routes only, dogfooded on kalakar. The verdict comes from reading the generated kalakar bundle view: rings true (construct confirmed → diff/checks get built on it), wrong (tracer bug), or hollow (construct gap — the most valuable outcome to learn cheaply).

## Vocabulary

- **Behavior** — one pokeable unit of the app. Identity: its **door** (v1: the route — method + resolved path). Carries clauses.
- **Clause** — one sentence-part of a behavior's contract: `requires`, `takes`, `gives`, `reads`, `writes`, `fails`. Every clause carries evidence (`file:line`) and a layer (`ast` / `semantic` / `heuristic`), same honesty discipline as facts. A clause the tracer could not resolve is emitted as an explicit `untraced` clause — never silently dropped.
- **Bundle** — a cluster of behaviors sharing a **trunk**: the same dependency gates and shared first-call spine (e.g. kalakar's `get_job_context` → `_ensure_persisted_building_model`). The bundle is the ten-minute-read unit; expect ~a dozen for kalakar.
- Behaviors and bundles **reference** facts; they never modify them. Facts stay pure atoms underneath.

## Behavior schema

Illustrative composite — clauses drawn from the login and render behaviors to show every field; a real behavior carries only its own:

```json
{
  "door": { "method": "POST", "path": "/api/auth/login", "evidence": {"file": "...", "line": 108} },
  "bundle": "auth",
  "requires": [ { "name": "get_db", "kind": "dependency", "evidence": {...}, "layer": "ast" } ],
  "takes":   [ { "schema": "LoginRequest", "evidence": {...}, "layer": "ast" } ],
  "gives":   [ { "schema": "LoginResponse", "evidence": {...}, "layer": "ast" } ],
  "reads":   [ { "target": "User", "kind": "db_model", "evidence": {...}, "layer": "semantic" },
               { "target": "JWT_EXPIRATION_MINUTES", "kind": "env_var", "evidence": {...}, "layer": "semantic" } ],
  "writes":  [ { "target": "ProjectArtifact", "kind": "db_model", "via": "db.commit", "evidence": {...}, "layer": "semantic" },
               { "target": "file", "detail": "*.glb under models dir", "evidence": {...}, "layer": "heuristic" } ],
  "fails":   [ { "status": 401, "evidence": {...}, "layer": "ast" } ],
  "untraced":[ { "call": "render_building_model_to_glb", "reason": "external package / depth limit", "evidence": {...} } ]
}
```

`reads`/`writes` targets resolve to existing facts where possible (db_model, env_var, integration); otherwise they carry a plain name. The read-only vs side-effecting split (any `writes` present) is first-class — it is the clause a nervous owner needs most.

## Tracer

A new scan phase after fact merge (it needs `ScanContext` parse trees, not just facts). Per route handler:

1. **Gates** — `Depends(...)` in the signature → `requires` clauses. Resolve the dependency function name; one hop into it to classify (db session, auth/context gate) where cheap.
2. **Takes / gives** — request-body parameter type and `response_model=` from the decorator, linked to existing `schema` facts by name.
3. **Body walk, depth ≤ 2** — the handler body plus same-repo helper functions it calls, max two hops. Detected markers:
   - `db.query(Model)` / `db.add` / `db.commit` / `db.refresh` → `reads`/`writes` on db_model facts
   - env access (direct or via module-level constants imported into the handler's module) → `reads` on env_var facts
   - file writes (open-for-write, known storage-service calls, path construction feeding a write) → `writes: file` (heuristic layer)
   - calls into packages outside the repo, or beyond depth 2 → `untraced` clause with the call name
4. **Failure modes** — `raise HTTPException(status_code=...)` in the walked region → `fails` clauses.

Determinism rule: identical source ⇒ identical behaviors. No model assist anywhere in the tracer.

Performance: the trace pass reuses the shared parse cache; v1 accepts an uncached full-repo trace per scan (kalakar-scale is fine). Fact-cache behavior is untouched; behavior caching is future work if it ever matters.

## Bundle clustering

Deterministic rules, applied in order:

1. Behaviors sharing the same non-trivial gate set AND the same first shared trunk call → one bundle, named from the trunk/router file (e.g. `building-model`).
2. Remaining behaviors group by resolved URL prefix (first two path segments after `/api[/vN]`).
3. Singletons stay singleton bundles; the renderer collects them under "Other".

Bundle naming uses code-recovered nouns only (router prefix, module name) — never invented domain language, per CONTEXT.md's honesty stance.

## Rendering

Markdown (`varai map` gains a `## Behaviors` section above the kind sections; placement mirrors `## Standard Patterns`):

```
## Behaviors (169 across 12 bundles)

### building-model (111) — gate: get_job_context · trunk: _ensure_persisted_building_model
  GET  /api/v1/building-model/{job_id}/quantities    read-only · takes —, gives QuantityTakeoffResponse · fails 409
  POST /api/v1/building-model/{job_id}/render        WRITES file(.glb), ProjectArtifact · gives WorkspaceRenderResponse
  ...

### auth (8)
  POST /api/auth/login   takes LoginRequest · gives LoginResponse · reads User, JWT_* · fails 401, 403
  ...
```

Dashboard: a "Behaviors" view — bundle list first, expandable to cards, every clause linking to `file:line`. Reuses the existing scan/SSE path; no new transport.

## Acceptance fixtures

The five hand-traced kalakar cards below are the golden target. The tracer is done when its output for these five routes carries the same clauses (allowing extra correct clauses, not missing ones):

1. **POST /api/auth/login** — takes `LoginRequest`, gives `LoginResponse`; reads `User`, `JWT_EXPIRATION_MINUTES`, `AUTH_MODE`; fails 401 (bad credentials), 403 (inactive); no writes. Note: `AUTH_MODE` swaps the `LoginRequest` shape at import time — acceptable if surfaced as reads-AUTH_MODE; the dual-schema subtlety is not required of v1.
2. **GET /api/v1/building-model/{job_id}/quantities** — requires `get_job_context`; read-only; gives `QuantityTakeoffResponse`; fails 409; untraced-or-traced call into `kalakar.building_model.quantities`.
3. **POST /api/v1/building-model/{job_id}/render** — requires `get_job_context`, `get_db`; gives `WorkspaceRenderResponse`; **writes** file (`.glb`) and `ProjectArtifact` (`db.commit`); reads `Project`.
4. **GET /api/v1/building-model/{job_id}/elevation-view/{direction}** — requires `get_job_context`; read-only; gives `ElevationViewResponse`; fails 400 (invalid direction).
5. **POST /api/v1/building-model/{job_id}/sheet-export** — requires `get_job_context`; read-only; gives PDF stream (no `response_model` — gives clause from `StreamingResponse`, heuristic layer); fails 400.

Bundle assertion: routes 2–5 cluster into one bundle; route 1 does not join it.

## Testing

- Unit: tracer pieces on synthetic FastAPI snippets — gates, takes/gives linking, each body-walk marker, depth limit, untraced emission, HTTPException collection.
- Golden: a fixture FastAPI mini-app in `examples/` (or `test/fixtures/`) exercising every clause type → checked-in markdown. The kalakar acceptance fixtures run as a manual checklist (kalakar is not vendored into the test suite).
- Clustering: unit tests on synthetic behavior sets for each rule and the singleton path.

## Out of scope (v1)

- Frontend tracing (store actions, UI doors) — second iteration, coarser territory.
- Domain-package internals (`src/kalakar/`) — below the waterline by design; they appear only as traced/untraced call names.
- Scripts, workers, pages as door types.
- Diff, snapshots, checks, steering output, intent binding — all now sequenced **after** the construct proves itself; diff diffs behaviors, not facts.
- Any model/LLM assist in tracing or naming.
- CONTEXT.md glossary entries for behavior/clause/bundle/trunk — added when the construct survives the kalakar reading, not before.

## Success criterion

The owner reads the generated kalakar bundle view and can answer "what does this part of my app do, and what does it touch" without opening code — the same "roughly, yes" the five hand cards earned, at full-app scale. Hollow cards are recorded, not hidden: each one marks either a tracer gap or a construct gap, and which one it is becomes the next decision.
