# Varai Semantic Language — Real-World Validation

Status: Passed with taxonomy refinements  
Date: 2026-07-18

## Scope

The v0 language was challenged against four structurally different projects:

- Trux: mobile/PWA, realtime service, push, local state, external processes.
- date-fns: public pure-function library.
- Temporal Python samples: durable workflows, workers, queues, signals, schedules, retries.
- Jaffle Shop: declarative data transformations, lineage, validation, metrics, and exports.

Only 3–5 representative behaviors and one meaningful change per project were inspected. The goal was to find kernel gaps, not to model each repository completely.

## Trux

Evidence base: local repository `/home/gp/dreamLand/jodulabs/trux`.

### Representative system language

```text
UI contains Conversation screen (platform: mobile/web).
Conversation screen offers Send Message.
Send Message accepts message text and turn configuration.
Send Message is available when text is non-empty and the conversation is idle.
Send Message creates a queued message stored on the device.
Send Message invokes Conversation Stream.

Service exposes Conversation Stream (delivery: stream).
Conversation Stream requires authentication and an existing conversation.
Conversation Stream accepts messages, interrupts, approvals, and resume requests.
Conversation Stream emits live conversation events.
Resume produces missed history.

App Startup triggers Register Push Device.
Register Push Device requires notification permission and a paired host.
Register Push Device invokes Expo Notifications and POST /push/subscribe.
POST /push/subscribe creates a subscription stored in SQLite.

User Message triggers Run Codex Turn.
Run Codex Turn invokes Codex CLI.
Run Codex Turn reads streamed events and emits normalized conversation events.
Interrupt invokes termination of the active process.
```

Key evidence:

- `apps/mobile/src/components/Composer.tsx`
- `packages/client/src/outbox.ts`
- `packages/client/src/connectionManager.ts`
- `apps/backend/src/stream.ts`
- `apps/backend/src/routes.ts`
- `apps/backend/src/push.ts`
- `apps/backend/src/adapter/codex.ts`

Coverage boundary: wiring, storage, process invocation, and event mapping are statically supportable. Network delivery, exactly-once behavior, OS permission, process correctness, and runtime ordering are not.

### Representative diff

Commit `03fa385e` lazy-loads native WebView support and adds fallbacks.

```text
Changed: Preview Pane
  + available when Native WebView is registered
  + produces unavailable/rebuild feedback otherwise

Changed: Terminal Pane
  + available when Native WebView is registered
  + produces unavailable/rebuild feedback otherwise
```

“Prevents a crash” is not supportable from source alone.

### Finding

No new relationship is needed. Rename Web UI to UI and qualify `platform`. Streaming, push, reconnect, subscription, and external processes fit `emits`, `produces`, `triggered_by`, and `invokes` with qualifiers.

## date-fns

Evidence base: [date-fns repository](https://github.com/date-fns/date-fns), including [`addDays`](https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/addDays/index.ts), [`parseISO`](https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/parseISO/index.ts), and the project’s documented immutable/pure-function stance.

### Representative system language

```text
Library exposes Add Days.
Add Days accepts a date, number of days, and optional context.
Add Days produces a new date.

Library exposes Parse ISO.
Parse ISO accepts an ISO string and options.
Parse ISO produces a date.
Parse ISO fails with Invalid Date (delivery: returned sentinel).

Library exposes Format Date.
Format Date accepts a date, format pattern, locale, and options.
Format Date produces formatted text.
```

Coverage boundary: signatures and direct failure paths are supportable. Locale correctness, timezone correctness, and purity require runtime evidence, complete effect analysis, or authoritative documentation.

### Representative diff

Historical commit [`ab02a4d`](https://github.com/date-fns/date-fns/commit/ab02a4dc76f6e3a8c716d6d66ca1bc131960d44f) expanded accepted date arguments across the library.

```text
Changed: date functions
  ~ accepted date input: Date | number -> Date | number | string
```

The grouped sentence is a renderer projection over many qualifier changes, not a new kernel primitive.

### Finding

Add a Library lens. Public function, parameter, returned value, returned sentinel, and thrown error map to existing `exposes`, `accepts`, `produces`, and `fails_with`. Do not add a `pure` relationship yet.

## Temporal Python samples

Evidence base: [Temporal Python samples](https://github.com/temporalio/samples-python) and [`hello/hello_activity.py`](https://github.com/temporalio/samples-python/blob/main/hello/hello_activity.py).

### Representative system language

```text
Worker listens on hello-activity-task-queue.
Worker offers Greeting Workflow.
Greeting Workflow accepts a name.
Greeting Workflow invokes Compose Greeting (timeout: 10 seconds).
Compose Greeting accepts ComposeGreetingInput.
Compose Greeting produces greeting text.

Greeting Workflow accepts Submit Greeting and Exit signals.
Submit Greeting changes pending greeting state.
Exit changes completion state.

Schedule triggers Greeting Workflow once per minute.
Greeting Workflow fails with activity failure after configured retry attempts.
```

Coverage boundary: decorators and worker registration support roles, task queues, calls, timeout, signals, and retry configuration. Temporal’s durability guarantees are framework semantics and must be inferred with named convention evidence, not claimed from local AST alone.

### Representative diff

Commit [`090b96d`](https://github.com/temporalio/samples-python/commit/090b96d750bafc10d4aad5ad506bb2439c413d5e) changed hello activities from async to sync.

```text
Changed: Compose Greeting execution
  ~ execution mode: asynchronous -> synchronous

Changed: Hello Activity Worker
  + requires thread-pool executor (capacity: 5)
```

Inputs, outputs, workflow invocation, and task queue remain unchanged.

### Finding

No new relationship is needed. Queue name, timeout, retry count, execution mode, and concurrency are qualifiers. Whether they appear in the main view or operational detail is a renderer decision.

## Jaffle Shop

Evidence base: [dbt Jaffle Shop](https://github.com/dbt-labs/jaffle-shop), its `models/staging` and `models/marts` sources, and commit [`2447e1b5`](https://github.com/dbt-labs/jaffle-shop/commit/2447e1b5) fixing customer-model fanout.

### Representative system language

```text
Build Staging Orders reads Raw Orders.
Build Staging Orders produces Staging Orders.

Build Order Items reads Staging Order Items, Staging Orders, Products, and Supplies.
Build Order Items produces Order Items.

Build Customers reads Staging Customers and Orders.
Build Customers produces Customers dataset.
Customers has fields customer ID, lifetime orders, lifetime spend, and customer type.

Validate Customers reads Customers dataset.
Validate Customers fails with lifetime-total invariant violation.

Export Customer Metrics reads Customers dataset.
Export Customer Metrics produces customer-order metrics table.
```

A Data renderer may collapse `Build Customers reads X and produces Customers` into “Customers is derived from X.” The kernel does not need `derived_from`.

Coverage boundary: declared `ref`/`source` lineage, selected fields, materialization, tests, metrics, and exports are supportable. Arbitrary macro expansion, warehouse behavior, data correctness, and scheduler execution may be partial or runtime-only.

### Representative diff

Commit `2447e1b5` removes a fanout-producing direct dependency and adds fields and validations.

```text
Changed: Build Customers
  - reads Order Items directly
  + reads order subtotal and tax through Orders

Changed: Customers dataset
  + field lifetime_tax_paid

Changed: Validate Customers
  + fails when pretax spend + tax does not equal lifetime spend

Changed: Order Items validation
  + requires each order ID to relate to Orders
```

### Finding

No `derived_from`, `transforms`, or `constrained_by` relationship is required yet. Transformation is a Behavior that `reads` inputs and `produces` a dataset. Validation is a Behavior that `reads` a dataset and `fails_with` an invariant violation.

## Overall result

The kernel passed all four projects.

Required taxonomy refinements:

1. Rename Web UI to UI; add a platform qualifier.
2. Add Library as a subsystem lens.
3. Document operational qualifiers such as delivery, storage, application state, optionality, execution mode, timeout, queue, and concurrency.
4. Clarify that purity/non-mutation needs complete effect coverage or authoritative evidence.

No new universal relationship was justified.

The language now covers:

- full-stack request/response applications;
- mobile and web interactive clients;
- realtime streams and push delivery;
- local CLI/developer tools;
- reusable libraries;
- durable workflows and workers;
- declarative data pipelines;
- persistent data and service processes.

The remaining meaningful shapes—desktop/TUI, infrastructure-as-code, embedded systems, and protocol-level libraries—can wait until product use exposes a need. The System Model IR can now be designed from this language without another broad validation round.

## Follow-up findings: application logic and AI systems

Application logic is not implicitly covered by API or UI vocabulary. Entry points expose how a system is reached; meaningful internal use cases, workflows, decisions, orchestration, and state transitions belong in an Application lens. Functions and helpers remain implementation evidence unless they have a stable system-level boundary.

AI-oriented systems do not currently justify a new kernel relationship. Model, Prompt, Context, Memory, Tool, Guardrail, Agent, and Evaluation can be represented as lens-specific Elements connected through existing relationships. The lens must maintain a strict coverage boundary: wiring and configuration can be observed, while correctness, prompt adherence, runtime tool success, and reliable termination generally cannot.

The Application lens is accepted. The AI lens remains provisional until a direct LLM or agent repository is validated; Trux only established external agent-process invocation.
