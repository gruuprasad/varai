# Behavior Cards and Bundles — v1 (FastAPI backend)

Status: draft for review
Date: 2026-06-10

## Purpose

This feature is an experiment with a product surface, in that order. The hypothesis it tests: **the behavior is Varai's construct** — the unit above code level that is (a) recoverable from code, (b) meaningful to a human without reading code, and (c) checkable. Facts are atoms; stock tags are labels; the behavior is the first thing with a boundary, an interface, and well-formedness.

A behavior is what a user can poke: a front door (route, page, script, worker handler) plus the contract observable from outside — what it takes, what it gives, what it requires, what it touches, what it changes, how it fails. The model for the reader experience is a **library spec**: nobody reads a library's code; they read "call this, it does that" and are satisfied. Varai shows the owner their own app the way a library shows itself to its users.

The daily loop this serves: **prompt → code appears → look at varai → poke exactly the right things in the running app → steer the next prompt.** Today that loop has only code (too low) and tests/manual use (pass-fail, and only on the paths you walk). The cards are the in-between view, and the vocabulary that a later "what changed since the last prompt" diff will speak. The vocabulary is not invented — it names what developers already think in (auth, storage, endpoints, jobs) and was never unified because the person thinking it also wrote the code. That person no longer writes the code; hence the lens.

v1 scope: FastAPI routes only, dogfooded on kalakar. The verdict comes from reading the generated kalakar bundle view: rings true (construct confirmed → diff/checks get built on it), wrong (tracer bug), or hollow (construct gap — the most valuable outcome to learn cheaply).

## Vocabulary

- **Behavior** — one pokeable unit of the app. Identity: its **door** (v1: the route — method + resolved path). Carries clauses.
- **Clause** — one sentence-part of a behavior's contract: `requires`, `takes`, `gives`, `reads`, `writes`, `fails`. Every clause carries evidence (`file:line`) and a layer (`ast` / `semantic` / `heuristic`), same honesty discipline as facts. A clause the tracer could not resolve is emitted as an explicit `untraced` clause — never silently dropped.
- **Bundle** — a cluster of behaviors sharing a **trunk**: the same dependency gates and shared first-call spine (e.g. kalakar's `get_job_context` → `_ensure_persisted_building_model`). The bundle is the ten-minute-read unit; expect ~a dozen for kalakar.
- Behaviors and bundles **reference** facts; they never modify them. Facts stay pure atoms underneath.

## The four constructs (v1 includes all, at stated confidence)

The vocabulary has parts of speech: behaviors are the verbs, subjects are the nouns, authored→derived is the arrow, ceremonies and stock patterns are the laws (local and global).

### Subject (noun) — high confidence

The central thing a bundle is about. Recovery: the object returned by the bundle's trunk call and passed through its behaviors (kalakar: `ensure_building_model_document` → "building-model document"). Named from the loader/type name — code-recovered nouns only. The subject card states its life phases, derived from the verbs that touch it: **created** (by what), **edited** (under what protection), **viewed** (as what projections), **exported** (as what formats), plus history if present. Rendered at the top of its bundle.

### Authored → derived (arrow) — high confidence

The subject is authored (persisted, mutated). Read-only behaviors in the bundle that compute payloads from it produce **derived** data — recomputed each time, never written back. Recovery: a read-only behavior in a subject bundle whose return is built from the subject. Rendered on the subject card: `document → quantities, elevations, sheets (derived — recomputed, never edited directly)`. Built-in checkable rule (future check, not v1): derived data that starts being persisted as its own authority gets flagged.

### Ceremony (local law) — highest confidence

The app's own conventions, recovered from repetition: when ≥3 mutating behaviors in a bundle share the same set of helper steps around their mutation (kalakar: assert revision → mutate → persist → push undo snapshot), that shared set **is** the ceremony — nobody has to declare it. Recovery: per mutating behavior, collect the bundle-shared helper calls in its body (the depth-2 walk already visits them); the modal set across siblings is the ceremony; per-behavior adherence is reported. v1 matches on the *set* of steps; ordering checks come later. Rendered as a ceremony line on the bundle: `mutation ceremony: check revision · persist · save undo — followed by 33/33` (or naming the deviants). Deviation is information, not necessarily error — the lens reports, the owner judges.

### Job (work that outlives a request) — low confidence, minimal in v1

v1 does only this: a bundle whose doors share a job-style path parameter (`{job_id}` and the like) and whose subject is loaded per that id is annotated **job-scoped**, and the subject card says what the subject is created from (kalakar: "created from a render job"). No async tracing, no status modeling — that's later, if the annotation proves useful.

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

**Storage is one concept; the medium is a detail.** A card says *stores* or *reads*; every such target carries a `medium` field from a small closed list: `db | file | memory | queue`. With the storage concept, putting data in Postgres, in a JSON file, or in an in-process copy is the same pattern — the medium detail is kept because it tells the reader who checks that data (the db engine checks itself; files barely; memory nobody), not because the pattern differs. Outbound network calls are their own verb (*calls out*), and gates/config live under *requires*. A target that fits no medium is a spec bug, not a fifth medium.

**Rendered vocabulary is plain words only**: *takes, returns, stores, reads, calls out, needs, fails with*. Internal field names are free; nothing a user reads says "substrate" or "clause".

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

### building-model (111) — job-scoped · needs: get_job_context

  Subject: **building-model document** (file, per-job) — created from a render job ·
  edited under revision protection · viewed as plan slices, elevations, quantities,
  schedules · exported as GLB, PDF · has undo history
  document → quantities, elevations, sheets, schedules (derived — recomputed, never edited directly)
  mutation ceremony: check revision · persist · save undo — followed by 33/33

  GET  /api/v1/building-model/{job_id}/quantities    reads only · returns QuantityTakeoffResponse · fails with 409
  POST /api/v1/building-model/{job_id}/render        stores file (.glb) and db (ProjectArtifact) · returns WorkspaceRenderResponse
  ...

### auth (8)
  POST /api/auth/login   takes LoginRequest · returns LoginResponse · reads db (User) · needs JWT config · fails with 401, 403
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

Construct fixtures (kalakar, manual checklist):

6. **Subject** — the building-model bundle's subject is identified as the building-model document (file medium, per-job), with phases: created from job, edited under revision protection, viewed as projections, exported as GLB/PDF, undo history present.
7. **Derived** — quantities, elevation views, and sheet exports are marked derived from the document; none marked authored.
8. **Ceremony** — the mutation ceremony (check revision, persist, save undo) is recovered from repetition alone, and the handlers in `dimensions.py` and `compound_walls.py` — which follow it by hand rather than via `apply_mutation` — are reported as adherent, not as deviations.
9. **Job** — the building-model bundle is annotated job-scoped via `{job_id}`; the auth bundle is not.

## Testing

- Unit: tracer pieces on synthetic FastAPI snippets — gates, takes/gives linking, each body-walk marker, depth limit, untraced emission, HTTPException collection.
- Golden: a fixture FastAPI mini-app in `examples/` (or `test/fixtures/`) exercising every clause type → checked-in markdown. The kalakar acceptance fixtures run as a manual checklist (kalakar is not vendored into the test suite).
- Clustering: unit tests on synthetic behavior sets for each rule and the singleton path.
- Constructs: unit tests on synthetic bundles — subject identification from a trunk return, derived marking of read-only siblings, ceremony recovery from ≥3 repeated step sets plus one deviant correctly reported, job-scoped annotation from path params. Kalakar construct fixtures 6–9 run as the manual checklist.

## Out of scope (v1)

- Frontend tracing (store actions, UI doors) — second iteration, coarser territory.
- Domain-package internals (`src/kalakar/`) — below the waterline by design; they appear only as traced/untraced call names.
- Scripts, workers, pages as door types.
- Diff, snapshots, checks, steering output, intent binding — all now sequenced **after** the construct proves itself; diff diffs behaviors, not facts.
- Any model/LLM assist in tracing or naming.
- CONTEXT.md glossary entries for behavior/clause/bundle/trunk — added when the construct survives the kalakar reading, not before.

## Success criterion

Two questions, both answered by the owner reading the generated kalakar bundle view:

1. "Can I tell what this part of my app does, and what it touches, without opening code?" — the same "roughly, yes" the five hand cards earned, at full-app scale.
2. "If a card's line changed after a prompt, is that the signal I would use to decide what to poke in the running app and how to steer the next prompt?" — the loop test.

Hollow cards are recorded, not hidden: each one marks either a tracer gap or a construct gap, and which one it is becomes the next decision.
