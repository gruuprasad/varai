# Varai Roadmap

Direction: see ADR 0003 — vendor-neutral lens for technical builders supervising AI-written code. Dogfooded on kalakar. Ordered by build sequence; each step must pass the dogfood rule before the next starts.

## 1. Snapshot foundation

An IR snapshot is the merged fact set (with stock tags) serialized to `.varai/snapshots/`, keyed by git commit hash (plus a dirty-state content hash when the tree is dirty). Cheap: the scanner already produces the fact set. Triggers are vendor-neutral — explicit `varai snapshot`, an optional git post-commit hook, or the watcher.

Snapshots also record the repo's intent artifacts (paths + content hashes of design/spec markdown, e.g. `openspec/`, `DESIGN.md`) so later phases can correlate fact changes with spec changes on the same timeline. Recording only — no parsing or binding yet.

## 2. Concept-level diff (wedge feature)

`varai diff <a> <b>` (and dashboard surface) renders the difference between two snapshots at concept level: facts added/removed/changed, grouped by kind and stock pattern — "auth gained a route", "new integration: email", "3 env vars added". Needs a design spec (snapshot identity, rename/move handling, rendering) before implementation.

## 3. Dogfood loop on kalakar

Daily use during real AI-assisted development. Every diff session feeds the catalog: concepts that fail to describe a real change reveal the next fact kind or stock pattern to add.

## 4. Checks (trust layer), kalakar-stack first

Falsifiable claims as derived passes over the fact set, same architecture as stock tags: FastAPI routes lacking auth dependencies, secrets referenced client-side, unverified webhook handlers. Each check reports *holds / violated / can't verify*, with evidence. New fact kinds (middleware, auth dependency) added as needed.

## 5. Steering output

A violated check emits a paste-ready, evidence-grounded fix instruction in plain markdown, usable with any AI coding tool. No vendor integration.

## 6. Intent binding (reconciliation)

In the AI-codegen workflow, intent exists as durable repo artifacts (design specs, plan docs) written *before* the code — it never needs to be recovered from code, only correlated with it. A reconciliation pass binds intent mentions to facts/stock patterns and sorts claims into three buckets: **intended-and-present** (verified, with evidence), **intended-but-absent** (gap), **present-but-unintended** (drift — the AI-supervision payoff). Bindings live in an overlay layer with their own honesty states (bound / unbound / ambiguous); facts stay pure. Hard constraint: no intent DSL — input is the markdown that already exists in the repo. Closes the control loop: intent is the setpoint the steering output corrects toward. Anticipated by ADR 0001 and CONTEXT.md's deferred "intent input".

## Deferred

- SaaS-founder trust panel (re-targeting of step 4–5 machinery; see ADR 0003)
- Context-evidence tier for stock matching (see CONTEXT.md)
- Hosted/web-connected distribution
