# Seed v4, Handoff, and Verification Leap — Execution Plan

**Date:** 2026-08-01  
**Status:** Proposed  
**Revision:** 2026-08-01 — automated execution through Seed v4; deferred human release checkpoint; existing-store reuse; conservative checker semantics.  
**Goal:** Take Varai from a proven adversarial POC to a repeatable product
loop — a Seed language rich enough to bind and loose enough to speak, a
handoff that is a self-checking contract, and verification that is redundant
rather than trusting — so that "did the builder build what I approved" has
fewer places to hide, and the product owner maintains none of it by hand.

> **For agentic workers:** Execute gate by gate. Keep the suite green at every
> commit. Do not start a later gate until the preceding exit criteria are met.
> The release gate is `npm test` (606 tests today); POC trials run via
> `scripts/poc-trials.js` against the sibling `varai-purchase-approvals-poc`.
> The current execution scope is Gates 0–3 and requires no product-owner action:
> use existing ratified examples and test fixtures, and never auto-ratify new
> intent. Gate H is deliberately deferred until a person chooses to run product
> validation; Gates 4–6 do not begin before Gate H.

## 0. Where Varai stands (honest read)

The loop is real and sound. `varai.seed.json` (human-ratified, hash-committed)
→ Markdown packet → builder → `varai.realization.json` (untrusted testimony) →
deterministic reconciliation against the System Model → surface accounting →
runtime scenarios → readiness gate with coverage-regression blocking. The nine
adversarial trials (omitted audit write, inverted authorization, state
corruption after denial, unexpected DELETE, coverage poisoning, pure refactor,
product change, outside-session edit) passed with zero false greens. The
honesty machinery is well-built: verdicts are separated from binding state,
absence requires `analyzed` coverage, collision detection
(`concept-collision`, `surface-collision`) downgrades lies to `cannot_verify`,
and the realization never enters a snapshot.

But the POC proved the machinery, not the workflow. Three things keep it from
being a product:

1. **The binding is the weakest link and it is hand-authored.**
   `src/reconciliation/resolve.js` matches builder-written
   `{lens, kind, key}` selectors against analyzer-derived keys with string
   equality. The builder is flying blind — it writes the realization once at
   the end of a build and discovers resolution failures only after the gate
   runs. There is no mid-build feedback, no candidate suggestion, and no
   validation the builder can run itself. The human-eval criterion "runtime
   mapping requires no per-change manual repair" is unmet by design today:
   `varai.runtime.json` is a third hand-authored artifact.
2. **The seed can declare more than it can check.** `performs` is
   recorded-only; `requires` on conditions checks claim *existence*, not
   *enforcement*; `emits` has zero capabilities; state transitions — the heart
   of the target application class (approvals, bookings, case management) —
   are unrepresentable except as scenarios, which are examples, not
   declarations. ADR 0007's own gap list says the rules that make operational
   software trustworthy "are not yet verified."
3. **The value question is open.** Human evaluation is pending; the product
   release gate has not passed. The roadmap states the pivot if target users
   reject the workflow.

The current POC also cannot pass one of the proposed release criteria — no
per-change manual runtime-map repair — because runtime mapping is still
hand-authored. That is a known engineering gap, not useful evidence from a
premature user study. The current plan therefore builds and automatically
stress-tests the complete product slice first, then asks people to evaluate it
once at Gate H.

## 1. Design north star

> Make the Seed the product's source program, the handoff a self-checking
> contract, and verification redundant rather than trusting — so that "did the
> builder build what I approved" has fewer and fewer places to hide, and the
> product owner maintains none of it by hand.

"Maintains none of it by hand" applies to bindings, runtime operation maps,
schemas, and verification bookkeeping. It does not remove the one intentional
human authority: a person reviews and ratifies Seed intent. During automated
execution, existing ratified examples stand in for that action; fixtures may
carry valid hashes, but no tool or agent approves production intent.

Every proposal below must pass the project's language-change rule: a user
question the current language cannot answer, two substrate examples, a
deterministic evidence strategy, identity and diff behavior, and lens-specific
rendering. Everything in this plan is filtered through that rule.

## 2. Seed language v4 — richer to bind, still loose to speak

Keep everything that works (stable IDs, semantic content hash ratification,
polarity, bounded relations, surfaces, scenarios, context). Add four things,
each optional and additive, so a v3 seed remains valid and readable.

### 2.1 `states` on resources — the big one for workflow software

```json
{ "id": "resource.purchase-request", "stateModel": {
    "initial": "pending",
    "states": ["pending", "approved", "rejected", "withdrawn"],
    "transitions": [
      { "from": "pending", "to": "approved", "via": ["behavior.approve-request"] },
      { "from": "pending", "to": "withdrawn", "via": ["behavior.withdraw-request"] }
    ] } }
```

- **User question it answers:** "Which state transitions are legal, and does
  the implementation realize them?" — currently unanswerable except as
  scattered scenarios.
- **Verification (deterministic):** new element-grain capability
  `application.state`. The analyzer recognizes assignments to a state field
  with literal values, reusing the existing effect-clause machinery in
  `src/scanners/lift/index.js` (which already extracts literal targets). A
  declared transition whose target-state assignment is absent under `analyzed`
  coverage → `violated`; an unrecognizable state-handling shape → `partial` →
  `cannot_verify`, never a silent pass. A target assignment alone does **not**
  prove that the `from` state is guarded or that the transition is legal:
  static `holds` requires recognizable from-state guard/path evidence, while a
  scenario crossing a transition corroborates reachability for that one path.
  "Scenario passed" stays the honest claim.
- **Identity/diff:** transition identity is `(resource, from, to, via)`;
  canonicalization sorts states and transitions, so reordering alone creates no
  semantic diff.

### 2.2 Optional field contracts on resources

```json
{ "id": "resource.submission-details",
  "fields": [{ "name": "amount", "type": "number", "required": true },
             { "name": "description", "type": "string", "required": true }] }
```

- **User question it answers:** "Does the data layer actually carry the fields
  the product needs?" — today `accepts` verifies a claim exists, not that the
  shape matches.
- **Verification:** strengthen the existing `data.contract` capability
  (element grain); do not introduce a second contract IR. Declared fields must
  be covered by observed `has_field` claims on the bound data element →
  `violated` under `analyzed`. Type and requiredness are checked only when the
  analyzer emits corresponding qualifiers; otherwise the result is
  `cannot_verify`, never an inferred pass. Extra observed fields are visible
  but not a violation (open world). Omitting the block declares nothing.

### 2.3 `flows` — grouping, not new relations

Optional `flows: [{ id, name, entry: <surface ref>, members: [<behavior refs>] }]`.
No new vocabulary; the blueprint and verification report gain per-flow
readiness and scenario coverage.

- **User question it answers:** "Is the whole submit → approve → order journey
  healthy, or just its parts?" Two examples: purchase approvals, bookings.
- This is the review altitude a product owner actually reads.

### 2.4 The vocabulary stays; the capabilities grow

The discipline that has kept this codebase clean is that the Seed vocabulary
maps one-to-one onto kernel relationships. Do not break it with `can_act` or
`forbids`. Instead:

- **`requires` gains teeth via a new `api.authorization` capability** (element
  grain): deterministic recognition of constrained-substrate guard patterns —
  authenticated-principal dependencies, literal role checks, and resource-owner
  equality guards leading to explicit `401/403` branches — with the honesty
  discipline: unrecognized guard shapes → `partial` → `cannot_verify`. A generic
  `Depends(...)` or `403` proves neither a role nor ownership; the observed guard
  clause must match the authored condition. This makes
  "behavior.withdraw-request requires condition.requester-owns-request"
  statically checkable on the bounded FastAPI slice, with scenarios as
  corroboration rather than the only check.
- **`performs` moves from recorded-only to scenario-corroborated:** every
  "actor performs behavior" commitment must be covered by at least one
  ratified scenario step in which that actor (via persona) invokes that
  behavior. Deterministic projection over seed + scenario runs; no new static
  capability; actors never need artifact bindings.
- **`emits`/`produces` get an effect-library extension:** extend the existing
  bounded `api.effect` body trace with recognized outbox/queue-insert and
  external-HTTP patterns, so "approve produces order AND emits order-created"
  is checkable rather than recorded. This is an extension of the current
  effect capability, not a new parallel analyzer model.

**Scenario language:** keep it exactly as bounded as it is. Defer scenario
entries referencing surfaces (the UI channel) — UI automation is a different
proof.

### 2.5 Explicitly not in v4

Temporal logic, cardinality, general invariants, `forbids`, UI-scenario
execution, arbitrary expressions, database inspection, concurrency or
atomicity claims. The roadmap's "deliberately deferred" list is correct.

## 3. Handoff v2 — how the Seed reaches the builder

The current handoff is a one-way Markdown drop. The leap is making it a
**self-checking contract**.

### 3.1 Structured packet (one Seed, two projections)

Keep default `varai handoff` Markdown byte-compatible. Extend the existing
`varai handoff --json` from a Markdown wrapper into the machine-readable
projection from the same deterministic renderer (`src/seed/handoff.js`). It
carries the Seed fingerprint, concept glossary, commitments with polarity and
checkability, surfaces, scenarios, and:

- **`changes`** — the complete `diffSeeds` result against the Seed stored by the
  latest `ready` build session, not only commitment IDs. Seed v4 extends the
  diff with state models, fields, and flows.
- **`carryForwardCandidates`** — bindings and surface bindings from that same
  session's `realizationObjectHash` whose referenced Seed IDs still exist and
  whose relevant Seed definitions are unchanged.

Carry-forward entries are candidates, never assertions that a mapping remains
valid. The builder must lint them against the current System Model. If no prior
`ready` session exists, both sections have an explicit empty/no-baseline state.

### 3.2 Published schema

`varai handoff --schema` emits JSON Schema for the realization and runtime map,
generated from the structural field definitions used by
`src/reconciliation/schema.js` and `src/runtime/schema.js`. JSON Schema covers
shape; the JS validators remain authoritative for Seed-aware references,
cross-field rules, and security checks that JSON Schema does not express.
Shared accept/reject fixtures keep the overlapping structural rules aligned.

### 3.3 Binding dry-run (`varai realization lint <file>`)

The highest-leverage, cheapest fix in this plan. Resolve the witness against
the current System Model *right now*. One command performs schema validation,
Seed reference/hash validation, and resolution, then reports per binding:
`resolved` / `ambiguous` / `not-found`. For failures it reports deterministic
candidate elements (same lens+kind; key/name token overlap; evidence-file
proximity). Equal-score candidates remain equal; lint never selects or writes a
binding, and candidates never affect a verdict. `--json` makes the same command
usable by builders and CI. Do not add a duplicate `check --witness-only` path.

### 3.4 Auto-derived runtime map (`varai runtime derive`)

Generate operations from current System Model operation elements (method/path),
approved API surface bindings (behavior), and scenario principals (personas).
Preserve stable runtime profile fields — start command, base URL, health path,
and persona credential/header configuration — from a valid current runtime map
or the latest matching verification run; regenerate Seed hash and operations.
If no baseline exists and profile fields cannot be observed, report the exact
unresolved fields and exit non-zero rather than inventing them. The managed
builder supplies that one-time application configuration; the product owner
never repairs per-change operation mappings. Print by default and write only
with explicit `--write`.

### 3.5 Binding-continuity projection

Do not add another ledger. Completed build sessions already persist the Seed,
realization, report, and start/completion snapshots by object hash. Compare the
current resolved mapping with the latest prior `ready` session on demand. A
concept that points to a different element reports `rebound`, including the old
element's fate from the stored snapshot (gone, renamed, or still present);
unchanged mappings report `carried`. A newly `ready` session naturally becomes
the next baseline. This keeps continuity deterministic without another mutable
authority or product IR.

## 4. Verification v2 — how Varai checks back

### 4.1 New and strengthened capabilities, full AGENTS.md discipline

Add `api.authorization` and `application.state`; strengthen the existing
`data.contract` and `api.effect` capabilities. Each change ships with
canonical model output, coverage, evidence, and before/after diff tests,
preserving serial/worker and native/WASM parity. The relation-contract table in
`src/reconciliation/relations.js` is the single place that changes per
capability — the pattern is proven.

### 4.2 Redundant determination, not more trust

Verification stops being "the binding plus one check" and becomes orthogonal
views that must agree:

- **Binding view** — commitment → bound element claims (today);
- **Surface view** — surface bindings cross-resolve to the same elements
  (today);
- **Runtime view** — scenario invocations cross-resolve to the same elements,
  with scenario results attached as independent evidence (today, strengthened
  by `performs` corroboration);
- **Continuity view** — prior-ready-session comparison (§3.5), new;
- **Static-semantics view** — authorization / state / contract capabilities,
  new.

These views are not statistically independent: several consume the canonical
System Model. They are independent checks in the product sense only when they
apply different invariants or evidence paths; do not market shared-model
redundancy as proof of independent observation. A false green must satisfy every
applicable cross-check; do not summarize that as five independent proofs.

### 4.3 Readiness gate v2

Adds to the existing rules: every declared transition has statically analyzed
target-state and from-state/path evidence; every authorization-shaped
`requires` commitment has matching `api.authorization` evidence under
`analyzed` coverage; declared fields are present; no unexplained `rebound`
exists; and degraded coverage on any new critical capability blocks readiness.
A passing scenario corroborates a transition or authorization path but never
upgrades missing universal/static evidence to `holds`.

### 4.4 Evolution projection

The existing per-commitment verdict comparison and coverage regression
(`src/build-session/evaluate.js`) extends to the new sections — the control
room timeline shows requirement health across builds, Seed diffs, and bindings.

## 5. Gates

Execute in order. Each gate keeps `npm test` green at every commit and ends
with its exit criteria plus a recorded trial outcome. Gates 0–3 are fully
automated and are the current execution scope. Gate H is a deferred product
release decision, not work required from the product owner now.

### Gate 0 — Automated baseline lock

Use the existing ratified purchase-approval POC and fixtures. Do not ask for a
new Seed decision and do not modify intent to make tests pass.
Programmatic ratification inside an isolated test fixture is synthetic test
setup only; it never becomes approval of production intent.

Tasks:

1. Run `npm test` and `node scripts/poc-trials.js`.
2. Record the current machine baseline: suite count, nine adversarial trial
   outcomes, coverage states, binding failures, and runtime-map edits required
   by the scripted evolution.
3. Ensure every later gate can rerun the same baseline non-interactively.

- **Exit criteria:** the suite is green; all nine trials run without a false
  green; the baseline is machine-readable and reproducible non-interactively;
  and no human approval, JSON editing, or UI action is needed.
- **Stop condition:** any seeded fault produces `ready`, a baseline depends on
  bespoke per-run edits, or native/WASM or serial/worker output diverges.

### Gate 1 — Binding UX leap

Tasks:

1. `varai realization lint <file> [--json]` — schema, Seed references, hash,
   current-model resolution, and deterministic candidates in one command.
2. Extend `varai handoff --json` with complete Seed changes and
   `carryForwardCandidates`; keep default Markdown unchanged.
3. `varai handoff --schema` — structural JSON Schema plus parity fixtures for
   the authoritative JS validators.
4. `varai runtime derive [--write]` — regenerate operation mappings while
   preserving stable runtime profile fields; fail explicitly on unresolved
   first-run configuration.
5. Derive carried/rebound continuity from the latest prior `ready` build
   session; add no ledger.
6. Adversarial trials: wrong-selector realization; stale carry-forward;
   rebinding to a still-present old element.

- **Verification:** focused tests for lint ranking/ties, structural-schema
  parity, runtime derivation, and prior-session continuity; trial-harness
  extensions in `test/poc/`.
- **Exit criteria:** a clean builder agent completes the scripted evolution
  without reading Varai source; a wrong selector is caught in one lint
  iteration; false greens stay zero; continuity reports `rebound`; and runtime
  operations require no product-owner repair.

### Gate 2 — Evidence semantics leap

Build the observer evidence before adding Seed v4 declarations. This gate may
extend existing v3 relation checking, but it does not reconcile state models or
field blocks that the language cannot yet parse.

Tasks:

1. `api.authorization` capability (element grain) on the FastAPI slice: guard
   recognition, exact condition clauses, and `analyzed`/`partial` discipline.
2. `application.state` capability: literal target-state assignments plus
   recognizable from-state/path evidence as canonical Claims and Coverage.
3. Strengthen the existing `data.contract` capability with type and
   requiredness qualifiers on `has_field` claims where syntax proves them.
4. Extend the existing effect library: outbox/queue-insert and external-HTTP
   patterns under `api.effect`, making `emits`/`produces` checkable.
5. Adversarial trials: inverted authorization caught *statically* (not only by
   scenarios); wrong state guard/target observed; missing field/effect observed;
   coverage poisoning on the changed capabilities blocked by the gate.

- **Exit criteria:** each capability has canonical model output, coverage,
  evidence, and before/after diff tests; native/WASM and serial/worker models
  remain identical; the bounded FastAPI baseline and each fault produce the
  expected Claims/Coverage; degraded critical coverage blocks readiness. No
  Seed v4 verdict is claimed in this gate.

### Gate 3 — Seed v4 + authoring

Tasks:

1. Seed v4 schema, validation, canonicalization, migration from v3, and
   identity rules for `states`, `fields`, `flows`.
2. Reconciliation and gate support for the new sections (§2, §4.3), consuming
   only the Gate 2 capabilities.
3. Extend `diffSeeds` and handoff changes/carry-forward eligibility for state
   models, fields, and flows.
4. Seed Studio: state-model wizard, field tables, flow grouping; blueprint
   rendering of flows and state diagrams.
5. Chat-assisted drafting with the new vocabulary; assistant remains a
   drafting boundary that cannot write or ratify.
6. Automated browser/CLI journey: draft a two-role workflow, review every Seed
   v4 construct, leave it unapproved, migrate a v3 fixture to an unapproved v4
   draft, and run the ratified v4 purchase-approval fixture through handoff,
   build, lint, derive, check, scenarios, and readiness.

- **Exit criteria:** v3 seeds remain valid; migration produces unapproved v4
  drafts; no assistant path can write or ratify; the automated authoring journey
  requires no direct JSON editing; green and faulted v4 fixtures produce honest
  verdicts; and the full Gate 0 baseline remains green.

### Gate H — Deferred human product validation

This gate is required before broadening the product, but it is outside the
current no-manual execution scope. When the product owner chooses to run it,
use `docs/poc/purchase-approvals-human-eval.md` once against the completed
Gate-3 slice with five target users.

- **Exit criteria:** all five users make the threshold change without JSON/code;
  at least 4/5 explain the authorization model and identify a broken build;
  runtime mapping needs no product-owner repair; the architecture view changes
  a real decision; and verification adds understandable confidence.
- **Stop condition:** policies require implementation vocabulary, verification
  needs bespoke per-app code, a seeded fault can produce `ready`, users treat
  the blueprint as decoration, or maintaining mappings costs more than reviewing
  generated code. If so, narrow to a developer-facing architecture-and-trust
  tool before Gate 4.

### Gate 4 — Real-repo adoption

Tasks:

1. Candidate-concept bootstrap: deterministic *proposal* of candidate
   concepts/surfaces over the observed model, presented for human
   ratification only — never ratified automatically, never intent inference.
2. Surfaces-only partial adoption mode (seed with surfaces and scenarios, no
   commitments).
3. Headless CI mode: `varai check --ci` with the gate and machine-readable
   exit codes.
4. Artifact hygiene and docs for adoption on an existing (non-greenfield) repo.

- **Exit criteria:** an existing repo completes a surfaces-only pass and a
  full pass; docs describe the adoption path.

### Gate 5 — Control room depth

Tasks: build-history timeline, per-requirement drift view, intervention
ledger, "what changed since I approved" view, seed-diff linked to requirement
changes.

- **Exit criteria:** a product owner answers "what changed since I approved"
  and "why is this build not ready" from the UI alone.

### Gate 6 — Second proof on the same substrate

Tasks: a bookings or case-management application on React/Vite + FastAPI +
SQLAlchemy, through the full loop, applying the two-examples rule to any
remaining vocabulary gaps.

- **Exit criteria:** two application classes pass the full loop; any language
  change introduced here is justified by the language-change rule.

## 6. The one risk to name

Everything in this plan is downstream of one atom: *can declared bindings stay
honest, cheap, and complete on real evolving systems?* Gates 0–3 attack all
three dimensions automatically — honest (collision, corroboration, and
prior-ready-session continuity), cheap (lint, candidates, schemas, derived
runtime operations, and carry-forward candidates), complete (surface
accounting, unaccounted detection, static semantics, and coverage regression).
If a lying or sloppy builder can still produce a green gate, stop before
language or UI breadth. Gate H answers the separate value question: whether
target users understand and want the resulting workflow. Deferring Gate H does
not count as passing it, and nothing in Gates 4–6 begins before it passes.

## 7. Explicitly out of scope

Framework breadth; hosted repository upload; a general AI IDE or browser code
editor; universal policy or temporal-logic languages; general invariant
proving; concurrency and atomicity proof; performance and SLA verification;
mobile and native applications; UI-scenario automation; a builder model
marketplace; any automatic inference of human intent from code.
