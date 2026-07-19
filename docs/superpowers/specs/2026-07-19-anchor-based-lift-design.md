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

An **anchor** is a stable, externally-referable point where scattered mechanism converges. A construct is an anchor when it passes three structural tests:

1. **Stable** — it survives its own implementation being rewritten (split a component into five, rewrite every route — the anchor remains).
2. **Externally referable** — something outside the subsystem can name or reach it (a table name, a URL/route, a command name, a queue topic).
3. **Convergence point** — scattered mechanism collects on it (many behaviors act on it; many components compose into it).

"Resource" in the strict sense (data, files, network, object/data-model aggregate) is *one kind* of anchor — the **subject-side** anchor, the thing code is *about*. It is not the only kind. Anchors take different concrete forms per lens, but all pass the same test:

| Lens | Anchor form | Anchor role | What converges on it |
|---|---|---|---|
| Data / backend | entity, file, object-model aggregate | **Resource** (subject) | behaviors that read/change/create it |
| UI | screen / navigable surface | **Interface** (reach) | components, user actions |
| API | operation / endpoint | **Interface** (reach) | acts on Resources |
| Worker | job / queue topic | **Interface** (reach) | acts on Resources |
| CLI | command | **Interface** (reach) | acts on Resources |

This resolves the UI question directly:

- A **leaf component** (`<Button>`, `<WallPanel>`) is *mechanism* — not externally referable, does not survive rewrite. It stays **evidence**.
- A **screen/page** is an anchor — it is *addressable* (route/URL, navigation lands on it) and stable while its inner components change. That URL-addressability is the "externally referable + stable" test passing. It is an **Interface**-kind anchor (reach), not a Resource-kind anchor (subject).

The kernel already has Resource, Behavior, and Interface roles. This spec changes nothing in the vocabulary. It changes **primacy and organization**: today `build.js` is Interface-first (routes/components on top, domain things buried as "just more elements"). The anchor-based lift makes the view **anchor-framed** — Resource anchors and Interface anchors on top, mechanism demoted underneath as evidence.

## The lift rule

Given the facts the analyzers already extract:

1. **Recover Resource anchors (the subject spine).** A construct becomes a Resource anchor when EITHER:
   - it is a **persisted declaration** (entity/table/model) — catches User, Project, RenderJob, ProjectVersion, etc.; OR
   - it is a **convergence point** — many distinct behaviors have an effect-claim (`reads`/`changes`/`creates`/`removes`) targeting it, even when it is an in-memory or library aggregate.

   Both are structural signals; either qualifies. The union matters because Kalakar's single most important concept — **BuildingModel** — is *not* a backend-persisted entity (it lives in the core Python library, `src/kalakar/`) yet ~28 behaviors converge on it. Persistence alone misses it; convergence catches it. Neither signal is a judgment; both are counts over extracted facts.

2. **Define Behaviors by their effect on an anchor**, not by route/handler identity. The `changes Project` / `reads BuildingModel` claims already exist in the extracted model. This is what re-expresses many mechanically-distinct routes (`POST/PATCH/DELETE …/walls`) as facets of one subject behavior (*edit the building model*), without discarding the individual routes.

3. **Attach Interfaces as reach.** Routes, screens, commands, queue topics are demoted from "top-level Element" to *how you reach* a behavior. They remain fully present, one level down.

4. **Demote all remaining mechanism to evidence.** DTOs/contracts, helpers, leaf components — openable underneath, never dropped.

5. **Report honestly, never guess.** Where the structure cannot resolve what a behavior acts on (in the real Kalakar run, 194 effects resolve only to `file` and 184 to `unknown resource`), Varai marks a **coverage gap**. It does not invent an anchor. Determinism requires this honesty valve.

## Not compression — re-projection at true scale

The goal is not fewer things. Nothing is summarized or discarded; every route, schema, and component remains, relocated to where a developer looks for it. The element *counts* are whatever the truth is: a large, grown system (Kalakar) must produce a model that shows it is large. The win is **tractability, not shrinkage** — the sprawl becomes navigable because it is framed by ~15 anchors and what acts on them, instead of a 314-route wall.

Success test:

> A developer opens the model and can find the part they need to change — "where does wall rendering happen," "what acts on the building model" — organized by what the system is about, with all implementation detail preserved one level down, and an honest picture of the system's real size and of what Varai could not resolve.

## Two views, one model

The recovered model supports two projections (the lift rule is identical for both; only the projection differs):

- **Browse-by-thing** — anchors (Resources/Screens) on top; open one to see the behaviors that act on it and the interfaces that reach it.
- **Browse-by-capability** — behaviors on top; each shows what it acts on and how it is reached.

## Provisional by design

We do not yet know which view or which anchor level is the most useful in practice. This spec fixes the **recovery mechanism** (deterministic, anchor-based, evidence-traced). It treats the **view level and its exceptions as provisional and revisable**: as we apply it to Kalakar (primary), then Trux and Varai (guardrails against overfitting), we expect to discover the right level for some concepts and the exceptions that need explicit handling. Anchor thresholds and effect-resolution depth are implementation details to be tuned against real extracted data, not fixed here. Any genuine model limitation that emerges is amended through the existing language-change rule (`docs/semantic-language.md`), never by adding a parallel IR or an LLM shortcut.

## Known analyzer gaps this exposes (real Kalakar data)

- **Shallow effect-resolution.** 368 of the effect-claim targets resolve to `file` (194) or `unknown resource` (184). The convergence signal is only as good as effect extraction; improving it is the main analyzer work this rule motivates.
- **Library aggregates are invisible.** BuildingModel is not extracted as a Resource because "persisted entity" is currently the only Resource source. Convergence-based promotion, and reaching into non-backend code (`src/kalakar/`), close this gap.

## Scope

In scope: the deterministic lift/framing rule; Resource anchors via persistence ∪ convergence; Behavior-by-effect; Interface/evidence demotion; honest coverage of unresolved effects; two projections over one model.

Out of scope (unchanged): the kernel vocabulary; the optional English interpreter; prompt/plan/input-registry ingestion; model-as-authoring-input. These remain later or deferred per ADR 0004 and the roadmap.
