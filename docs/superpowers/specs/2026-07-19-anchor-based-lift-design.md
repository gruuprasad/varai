# Anchor-Based Lift: Framing the System Model Around What Code Acts On

Status: Draft for review
Date: 2026-07-19
Direction: ADR 0004 (the System Model is the product). This spec does not change the kernel; it defines how code is lifted into it.

## Problem

Varai already has the right container — System, Subsystem, Element, Claim, evidence, claim state, coverage (`docs/semantic-language.md`, `src/system-model/`). What it lacks is a *target for the lift*. `src/system-model/build.js` promotes every code construct 1:1 — each route becomes an operation Element, each schema a contract Element, each component a component Element.

Run against the Kalakar backend alone, this produces:

| Extracted as top-level Element | Count |
|---|---|
| `contract` (DTOs/schemas) | 469 |
| `operation` (routes) | 314 |
| `command` | 34 |
| `entity` | 11 |
| `process` | 5 |
| **Total** | **833 Elements, 2544 Claims** |

This is the *compute model* rendered in kernel vocabulary. It is organized by **mechanism** (how the code is filed: routes, handlers, components). The model a developer keeps in their head is organized by **subject** (what the software is about: projects, building models, rendering, drawings).

These are two orthogonal decompositions of the same system. Zooming out on the mechanism axis yields *architecture* (layers, packages) — never the subject. This is the *tyranny of the dominant decomposition*: code can only be physically filed one way, and every other meaningful decomposition — including the domain model a human reasons with — is left scattered across that filing.

**Varai's job is to recover the scattered subject decomposition from code filed by mechanism — deterministically.**

## Why deterministic is the whole point

An LLM could read the code and narrate "this is a building-design tool with these concepts." That would be unreproducible, unfalsifiable, unattributable — another disposable summary. The struggle *is* the constraint: recover the subject decomposition using only structural facts the code provably exhibits, with every promotion traceable to evidence.

This keeps Varai a **lens** (shows what is mechanically there) rather than a **narrator** (tells a plausible story). The recovered model is falsifiable: every promoted concept points at the structural fact that earned it — the persisted declaration or the convergent effect-claims — and every recovered name traces to a symbol, route, schema, or label in the code.

The optional LLM role is unchanged from ADR 0004 and the roadmap: it may narrate an already-proven deterministic model in English. It never discovers or authorizes a concept. Removing it changes readability only.

## Core concept: the anchor

The lift is a **re-framing of the view around anchors instead of around routes and components.**

An **anchor** is a stable point where scattered mechanism converges and around which a projection organizes the view. **Anchor is a derived projection concept, not a new kernel role.** The kernel keeps only Resource, Behavior, and Interface roles (ADR 0004); "anchor" is a property Varai *derives* about certain Elements to decide how a view is organized. This spec adds no vocabulary.

### Two separate decisions

Design review made this distinction load-bearing, and the spec adopts it:

1. **Semantic promotion** — is a construct an Element at all, and with which role (Resource / Behavior / Interface), or is it implementation evidence? This is a property of the construct.
2. **Anchor prominence** — does a *projection* use this Element as a navigation root, or does it appear as a reach path beneath a behavior? This is a property of the view, derived and *ranked*, never a brittle binary on the Element.

Conflating these is what would keep the 314-route wall: every endpoint is externally reachable, so "reachable" cannot gate top-level display. Endpoints, commands, and jobs remain stable Elements, but in the default projection they appear as **reach paths beneath behaviors**, not as browse roots. Resource subjects and UI surfaces are the primary browse roots.

### "Stable" is a test, not a snapshot signal

A single scan cannot directly observe "survives a rewrite." What the analyzer *can* observe structurally:

- **named declarations** (an entity, an exported symbol, a route path);
- **boundary addressability** (a URL, a command name, a queue topic, a navigable screen);
- **references across mechanism boundaries** (the same declaration reached from UI, API, and library code);
- **convergent interactions** (many distinct behaviors interacting with one declaration).

Stability itself — that the derived identity survives two equivalent implementations — is established by **invariance fixtures** (see acceptance tests), not asserted from one snapshot.

### Anchor forms per lens

"Resource" in the strict sense (data, files, network, object/data-model aggregate) is the **subject-side** anchor — the thing code is *about*. It is not the only anchor form. Different lenses contribute different prominent anchors, but all are derived from the observable signals above:

| Lens | Prominent anchor form | Kernel role | What converges on it |
|---|---|---|---|
| Data / backend | entity, file, object-model aggregate | **Resource** (subject) | behaviors that read/change/create it |
| UI | screen / navigable surface | **Interface** (reach) | components, user actions |
| API | operation / endpoint | **Interface** (reach) | acts on Resources |
| Worker | job / queue topic | **Interface** (reach) | acts on Resources |
| CLI | command | **Interface** (reach) | acts on Resources |

This resolves the UI question directly:

- A **leaf component** (`<Button>`, `<WallPanel>`) is *mechanism* — not addressable, does not survive rewrite. It stays **evidence**.
- A **screen/page** is a prominent anchor — it is *addressable* (route/URL, navigation lands on it) and stable while its inner components change. It is an **Interface**-role Element used as a browse root in the UI projection.

Today `build.js` is Interface-first: routes and components are all promoted to top-level Elements, and domain things are buried as "just more elements." The anchor-based lift keeps the same kernel roles but **derives prominence** so that Resource subjects and UI surfaces frame the view, while endpoints/commands/jobs and private mechanism sit beneath as reach and evidence.

## The lift rule

Given the facts the analyzers already extract:

1. **Recover Resource subjects (the spine).** A construct becomes a Resource Element when EITHER:
   - it is a **persisted declaration** (entity/table/model) — catches User, Project, RenderJob, ProjectVersion, etc.; OR
   - it is a **convergence point** — many distinct behaviors have an effect-claim (`reads`/`changes`/`creates`/`removes`) that *resolves* to it, even when it is an in-memory or library aggregate.

   Both are structural signals; either qualifies. The union matters because Kalakar's single most important concept — **BuildingModel** — is *not* a backend-persisted entity (it lives in the core Python library, `src/kalakar/`) yet ~28 behaviors converge on it. Persistence alone misses it; convergence catches it. Neither signal is a judgment; both are counts over extracted facts.

   **Convergence promotes only a resolvable named declaration.** It never mints a domain concept from repeated strings: 194 effects targeting the literal `file` do not create a "File" Resource. An effect target that cannot be resolved to a declaration stays a coverage gap (rule 6). Persisted-but-internal records (caches, join tables, token tables) are still promoted as Resource Elements — it is prominence *ranking*, not promotion, that keeps them out of the default browse roots.

2. **Resolve cross-representation identity before counting convergence.** BuildingModel appears as a Python aggregate, an API contract, a serialized document, and frontend state. Those references merge into one Resource only through provable linkage:
   - symbol/import/call/boundary resolution where the code proves the connection;
   - linked representations where a request/response pair or a serialization/conversion establishes it;
   - `ambiguous` claim state when only normalized names match;
   - never a merge based solely on identical names.

3. **Anchors group Behaviors; effects alone do not define them.** Behavior identity comes from a **stable action boundary plus its contract, effects, and outcomes** — not from the Resource it touches and not from raw route/handler identity. Adding a wall, deleting a storey, and importing a model all `change BuildingModel`: they belong to the same group and remain three distinct Behaviors. A higher-level workflow (*edit the building model*) is promoted only when call/effect tracing proves a stable orchestration boundary — never by effect-target equality.

4. **Attach Interfaces as reach.** Routes, screens, commands, and queue topics remain stable Elements, but in the default projection they appear as *how you reach* a behavior — reach paths beneath it — rather than as browse roots.

5. **Split contracts by boundary; demote the rest of mechanism to evidence.**
   - **Boundary/public contracts** — an API response schema, a published event payload — are system-level Elements and must remain structurally diffable: "API response contract changes" is validation scenario #1 in `docs/semantic-language.md`, and prior dogfooding depends on it.
   - **Private DTOs, intermediate schemas, helpers, leaf components** are implementation evidence — openable underneath, never dropped.

6. **Report honestly, never guess.** Where the structure cannot resolve what a behavior acts on (in the real Kalakar run, 194 effects resolve only to `file` and 184 to `unknown resource`), Varai marks a **coverage gap**. It does not invent a Resource. Determinism requires this honesty valve.

## The lift pipeline

```text
AST/framework observations
    ↓
private implementation graph
    ↓
candidate referents and stable boundaries
    ↓
deterministic binding and effect resolution
    ↓
Resource / Interface / Behavior Elements and Claims
    ↓
derived anchor prominence (ranked)
    ↓
browse-by-thing and browse-by-capability projections
```

### Structured provenance makes "one level down" true

Evidence today is flat file/line/symbol. That cannot preserve a navigable derivation such as:

```text
UI action → API call → endpoint → application operation → state effect
```

The lift therefore requires a **private implementation graph**: structured provenance recording how each Claim was derived, so a user can open an anchor and walk behavior → interface → implementation path → source. This is *not* a second product IR — it is private derivation machinery inside the analyzers, in the same way parser observations already are (ADR 0004). It is never persisted as a public model, never diffed, and carries no vocabulary of its own. Without it, the promise that "every route, schema, and component remains openable underneath" is not true.

## Not compression — re-projection at true scale

The goal is not fewer things. Nothing is summarized or discarded; every route, schema, and component remains, relocated to where a developer looks for it. The element *counts* are whatever the truth is: a large, grown system (Kalakar) must produce a model that shows it is large. The win is **tractability, not shrinkage** — the sprawl becomes navigable because it is framed by ~15 anchors and what acts on them, instead of a 314-route wall.

Success test:

> A developer opens the model and can find the part they need to change — "where does wall rendering happen," "what acts on the building model" — organized by what the system is about, with all implementation detail preserved one level down, and an honest picture of the system's real size and of what Varai could not resolve.

## Two views, one model

The recovered model supports two projections (the lift rule is identical for both; only the projection differs):

- **Browse-by-thing** — anchors (Resources/Screens) on top; open one to see the behaviors that act on it and the interfaces that reach it.
- **Browse-by-capability** — behaviors on top; each shows what it acts on and how it is reached.

## Provisional by design

We do not yet know which view or which anchor level is the most useful in practice. This spec fixes the **recovery mechanism** (deterministic, anchor-based, evidence-traced). It treats the **view level and its exceptions as provisional and revisable**: as we apply it to Kalakar (primary), then Trux and Varai (guardrails against overfitting), we expect to discover the right level for some concepts and the exceptions that need explicit handling. Prominence ranking and effect-resolution depth are implementation details to be tuned against real extracted data, not fixed here. Any genuine model limitation that emerges is amended through the existing language-change rule (`docs/semantic-language.md`), never by adding a parallel IR or an LLM shortcut.

## Acceptance tests

These are the invariance fixtures the anchor section defers to. The lift is implemented only when all hold:

1. Splitting or renaming private helpers changes evidence only — no Element or Claim identity changes.
2. Two actions affecting the same Resource remain distinct Behaviors (add wall ≠ delete storey ≠ import model).
3. Adding another route to an existing Resource does not rename or replace that Resource.
4. A public response-contract change remains a structural semantic change in the diff.
5. Same-named constructs are not merged without structural linkage; name-only matches surface as `ambiguous`.
6. Unresolved effects produce coverage gaps, never Resources.
7. A user can trace an anchor to its behaviors, each behavior to its interfaces and implementation path, and each path to source.

## Known analyzer gaps this exposes (real Kalakar data)

- **Shallow effect-resolution.** 368 of the effect-claim targets resolve to `file` (194) or `unknown resource` (184). The convergence signal is only as good as effect extraction; improving it is the main analyzer work this rule motivates.
- **Library aggregates are invisible.** BuildingModel is not extracted as a Resource because "persisted entity" is currently the only Resource source. Convergence-based promotion, and reaching into non-backend code (`src/kalakar/`), close this gap.
- **Evidence is flat.** File/line/symbol references cannot express the derivation path behind a claim. The private implementation graph closes this.

## Scope

In scope: the deterministic lift/framing rule; Resource promotion via persistence ∪ resolved convergence; cross-representation identity resolution; behavior identity by action boundary (anchors group, effects don't define); ranked anchor prominence as a projection concern; boundary-contract promotion with private-DTO demotion; the private implementation/provenance graph; honest coverage of unresolved effects; two projections over one model.

Out of scope (unchanged): the kernel vocabulary; the optional English interpreter; prompt/plan/input-registry ingestion; model-as-authoring-input. These remain later or deferred per ADR 0004 and the roadmap.
