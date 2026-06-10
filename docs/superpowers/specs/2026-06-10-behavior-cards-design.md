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

Every `reads`/`writes` target carries a `substrate` field from a **closed taxonomy**: `db | file | net_out | queue | clock | config`. This is the system-level machine the clause touches — the analog of registers/RAM one level up (the door itself is the `net_in` resource). The taxonomy is deliberately small and fixed: substrate categories are universal across apps, which is what makes cards comparable between projects and lets later features (diff, checks) generalize. A target that fits no category is a spec bug, not a seventh category.

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

### Call-graph stance

v1 deliberately builds **no general call graph**. The accuracy burden differs per output, and the design exploits that:

- **Bundles need no call resolution.** Gates live in the handler signature (`Depends(...)`) and the trunk is the first shared call *by name* — depth-0 reading. Bundle clustering is therefore the most robust output, not the most fragile.
- **takes / gives / requires / fails** are signature- and body-local. Robust.
- **reads / writes** is where call depth bites (side effects hide inside helpers). Three mechanisms instead of a call graph:
  1. **Pattern-known calls** — `db.query/add/commit` recognized via the `Session` parameter annotation plus call pattern; env constants; known storage idioms. Recognized by shape, never followed into libraries.
  2. **Bounded walk, cheap resolver** — depth ≤ 2 into same-repo functions, resolving only direct `from x import y` imports (same machinery family as router-prefix resolution). No re-export chains, no dynamic dispatch, no function-valued arguments.
  3. **Silence never proves read-only.** Unresolved calls — beyond depth, function-passed-as-argument (e.g. kalakar's `apply_mutation(..., update_site_context, ...)`), decorator indirection — become `untraced` clauses, and a behavior with any `untraced` clause may not claim "read-only": the renderer shows **"no writes found · N calls unverified"**. Tracing weakness is allowed to make cards vaguer, never falsely confident — the fact-layer honesty discipline applied to tracing.

Known v1 blind spots, accepted and surfaced as `untraced`: higher-order calls, decorator wrappers, package re-exports, methods on objects of unresolved type. The judgment-day reading measures **untraced density per card**; where unverified clauses cluster on behaviors the owner cares about, that names the next targeted tracer investment — instead of front-loading general call-graph work.

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

Read-only wording in fixtures 2, 4, 5 follows the call-graph stance: the card claims "read-only" only if every call is traced or pattern-known; otherwise it must render "no writes found · N calls unverified". Either rendering passes the fixture — what fails it is a missing clause or a false "read-only" alongside untraced calls.

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
