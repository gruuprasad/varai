# Seed → Build → Verify Vertical Slice

**Date:** 2026-07-23  
**Status:** Proposed implementation plan  
**Product target:** A usable prototype, not a general formal-methods platform

## Outcome

Build one complete, local-first Varai workflow in which a person:

1. describes a small but non-trivial software system in ordinary language;
2. uses an LLM to draft a structured seed;
3. reviews and explicitly ratifies that seed;
4. hands the ratified seed to an interchangeable coding agent;
5. receives code plus an untrusted realization witness from the builder;
6. lets Varai independently derive its canonical System Model;
7. sees which seed commitments hold, fail, remain unbound, or cannot be verified;
8. follows a domain-organized reading path into the relevant code and evidence;
9. changes the seed and repeats the loop to prove that Varai preserves system shape through evolution.

The slice expands the existing Varai architecture. It does not replace the scanner, System Model,
snapshots, diff, behavioral envelopes, evidence, coverage, dashboard, or CLI.

## Product boundary

This prototype is a **domain review loop for AI-built software**. It is not:

- a universal programming language;
- a proof that generated software fully matches human meaning;
- an autonomous architect that invents or approves product intent;
- a replacement for Codex, Claude, or another coding agent;
- a general-purpose IDE;
- a reverse-engineering system for arbitrary existing repositories;
- a second public or persisted analyzer IR.

The builder proposes. The canonical System Model observes. The verifier checks only predicates whose
meaning and analyzer coverage it can establish. Everything else remains explicit as unverified.

## Pilot application: Slotkeeper

Build a separate greenfield repository, tentatively named `varai-slotkeeper-pilot`. Keep it outside
the Varai repository so the experiment is a real consumer and does not contaminate Varai's own scan.
Reduce any important analyzer case discovered there into small fixtures inside Varai afterward.

Use one stack already close to Varai's strongest evidence path:

- React/Vite UI;
- FastAPI API;
- SQLAlchemy with SQLite;
- a small notification outbox/worker boundary;
- ordinary Git history.

Slotkeeper manages booking of shared time slots. It is intentionally larger than CRUD but small
enough to understand completely.

### Initial domain

- A member sees available slots.
- A member books an available slot.
- A booking creates a reservation and makes the slot unavailable.
- A member cancels their own booking.
- An administrator may cancel any booking.
- Cancellation releases the slot.
- Booking and cancellation create notification work.
- Attempting to book an unavailable slot has an observable failure.
- Unauthorized cancellation has an observable failure.

The seed should express only commitments that matter to the human. Framework, folder layout,
database library, styling, and deployment preferences belong in the build brief unless explicitly
promoted into durable constraints.

### Evolution scenario

After version one works, amend the ratified seed:

> An administrator may override an existing booking. The displaced member must be notified and an
> audit record must be created.

This second build must exercise seed diff, affected commitments, stale witnesses, new effects,
missing realization, and the code-reading lens. A one-time greenfield build is not enough to prove
Varai's value.

## Architecture

```text
human conversation
  → seed assistant (untrusted drafting)
  → validated draft
  → human-ratified varai.seed.json
  → vendor-neutral build packet
  → AI builder
  → repository + varai.realization.json
  → existing analyzers
  → canonical System Model
  → seed reconciliation projection
  → CLI/dashboard review
```

There are three durable inputs or outputs with different authority:

1. `varai.seed.json` is human-ratified source intent.
2. `varai.realization.json` is builder testimony and is never a verdict.
3. The System Model is Varai's independently observed artifact model and remains the only public,
   persisted, versioned analyzer model.

The seed is a source program, not an analyzer IR. The realization file is provenance/witness input,
not a second model. Reconciliation results are deterministic projections and may be regenerated.

## Contract 1: minimal seed language

### Design

Use plain, canonical JSON for the first slice. Human-facing prose remains in the document, but the
checkable core uses stable concepts and the existing framework-neutral relation vocabulary.

The initial concept roles are:

- `actor`
- `behavior`
- `resource`
- `condition`
- `outcome`

The initial checkable relations are deliberately bounded to those already represented in the
System Model:

- `invokes`
- `accepts`
- `requires`
- `reads`
- `changes`
- `creates`
- `removes`
- `produces`
- `fails_with`
- `emits`

Do not add `forbids`, temporal logic, cardinality logic, or a general invariant language in this
slice. Represent the no-double-booking commitment through an availability prerequisite plus an
observable unavailable-slot failure. Record the stronger atomicity meaning as human-owned context
until runtime or transaction evidence can support it.

An indicative document shape is:

```json
{
  "formatVersion": 1,
  "system": { "id": "slotkeeper", "name": "Slotkeeper" },
  "concepts": [
    { "id": "behavior.book-slot", "role": "behavior", "name": "Book Slot" },
    { "id": "resource.booking", "role": "resource", "name": "Booking" },
    { "id": "condition.slot-available", "role": "condition", "name": "Slot is available" }
  ],
  "commitments": [
    {
      "id": "commitment.booking-requires-availability",
      "source": "behavior.book-slot",
      "relation": "requires",
      "target": { "concept": "condition.slot-available" }
    },
    {
      "id": "commitment.booking-creates-booking",
      "source": "behavior.book-slot",
      "relation": "creates",
      "target": { "concept": "resource.booking" }
    }
  ],
  "context": [],
  "ratification": { "status": "ratified", "contentHash": "..." }
}
```

The schema must permit literal targets for failures and conditions. Varai owns identity mechanics:
the assistant may propose names and additions, but it may not silently replace stable IDs when a
concept is renamed.

### Ratification rules

- An LLM response creates or changes a draft only.
- Only an explicit human action writes a ratified seed.
- Every ratified seed includes a hash of all semantic content excluding ratification metadata.
- A realization file names the exact seed hash it was built against.
- Git provides durable history; Varai does not invent a parallel version-control system.
- Updating a ratified seed invalidates older realization witnesses until they are reconciled or
  explicitly carried forward.
- The raw authoring transcript is not persisted by default.

## Contract 2: builder handoff and realization witness

### Vendor-neutral handoff

Varai generates a plain Markdown/JSON build packet containing:

- system purpose and ratified seed hash;
- selected concepts and commitments;
- build preferences;
- instructions to implement, test, and update `varai.realization.json`;
- the witness schema and examples;
- a warning that Varai will independently scan the result.

For the prototype, the user copies this packet into Codex, Claude, or another coding agent. Do not
build direct agent orchestration yet. This proves vendor neutrality and avoids coupling the first
mechanism experiment to one session API.

### Witness semantics

The realization file answers only:

> Which observed artifact boundaries should Varai examine for this seed concept or commitment?

It does not answer whether the commitment holds.

Support:

- concept bindings to one or more artifact anchors;
- explicit claim witnesses identifying source and target bindings;
- many seed concepts sharing an artifact;
- one seed concept spanning several artifacts;
- a seed hash and optional builder/build metadata;
- artifact anchors by stable public selector where possible;
- source file and symbol evidence as a fallback;
- an explicit `adopted` operation for unchanged existing artifacts used by a new commitment.

Indicative shape:

```json
{
  "formatVersion": 1,
  "seedHash": "...",
  "bindings": [
    {
      "id": "binding.book-slot-api",
      "concept": "behavior.book-slot",
      "artifact": {
        "lens": "api",
        "kind": "operation",
        "key": "POST /bookings",
        "source": { "file": "backend/routes/bookings.py", "symbol": "create_booking" }
      }
    }
  ],
  "witnesses": [
    {
      "commitment": "commitment.booking-creates-booking",
      "sourceBinding": "binding.book-slot-api",
      "target": { "concept": "resource.booking" }
    }
  ]
}
```

The final schema must be locked by tests before instructing the builder. Prefer stable public
boundaries such as operations and Resources over source lines. Source locations support resolution
and reading but do not define semantic identity.

## Contract 3: reconciliation and verdicts

Implement reconciliation as a pure, deterministic layer consuming:

```text
ratified seed + realization witness + canonical System Model + coverage
```

Do not mutate the System Model or persist a second combined graph.

Keep binding state separate from verification verdict:

### Binding states

- `unbound` — no witness was supplied;
- `resolved` — the artifact selector resolves uniquely;
- `ambiguous` — more than one artifact satisfies the selector;
- `stale` — the witness names an absent artifact or a different seed hash.

### Verification verdicts

- `holds` — the resolved artifact pair has the required canonical Claim;
- `violated` — the required Claim is absent under sufficient relevant coverage;
- `cannot_verify` — relevant coverage is partial, unsupported, or failed;
- `not_checkable` — the seed statement is retained as human context but has no checker semantics.

Every result includes:

- seed commitment ID;
- binding IDs;
- matched System Model Element and Claim IDs;
- evidence locations and implementation paths;
- coverage used to justify the verdict;
- deterministic reason codes;
- related behavioral envelope IDs for presentation when available.

Behavioral envelopes and observed areas may organize the review experience, but they are not the
truth source. Initial checks match seed predicates directly against canonical Claims. This lets the
seed simplify the verifier without waiting for semantic-region work to finish.

### Absence discipline

A missing matching Claim becomes `violated` only when the capability responsible for that relation
reports `analyzed` for the resolved scope. Otherwise the result is `cannot_verify`.

Do not claim arbitrary code is orphaned. The seed is partial and implementation details are
open-world. The prototype may report:

- bindings that reference no seed concept;
- changed/created/removed/emitted effects unaccounted for inside an explicitly closed seed scope;
- otherwise, `unbound observed behavior`, not “unauthorized behavior.”

Closed-scope orphan detection is a later gate and must not block the core vertical slice.

## Seed assistant boundary

Add a small `SeedAssistant` interface with a deterministic fake used by tests and one real provider
adapter for the pilot. Keep the provider outside seed validation and reconciliation.

The real adapter:

- uses Node's built-in `fetch` rather than adding an SDK dependency;
- is configured through explicit endpoint, model, and environment-based credential;
- sends only the human conversation and current seed, never repository code;
- shows the destination model/provider before each outbound request;
- makes no request without an explicit user action;
- returns structured draft/proposal JSON that must pass local validation;
- cannot write or ratify the seed itself;
- degrades to manual JSON proposal import when no provider is configured.

One adapter is enough for the pilot. Additional providers are deferred until the protocol proves
useful.

## Seed Studio and review UI

Extend the existing local dashboard rather than introducing a frontend framework or separate app.

### Authoring view

Add an `Intent` navigation item with:

- human conversation/input panel;
- assistant clarifying questions;
- structured concepts and commitments panel;
- validation errors and unsupported statement classification;
- semantic diff against the currently ratified seed;
- explicit reject/edit/ratify actions;
- current seed hash and Git-dirty indication.

### Review view

After scanning, show each commitment with:

- binding state;
- verification verdict;
- observed artifact path;
- evidence and source links;
- coverage and reason codes;
- related behavioral envelope;
- suggested code-reading order.

The reading order begins at a domain commitment, follows its resolved public behavior, then follows
the existing System path/envelope to effects, outcomes, and source evidence. It must not use an LLM
to manufacture verdict text.

### Local mutation safety

The server currently exposes read-only endpoints. New mutation endpoints must:

- bind only to `127.0.0.1` as today;
- accept JSON with bounded body size;
- reject unexpected origins;
- write only the fixed seed file under the selected repository root;
- use atomic rename-based writes;
- never expose provider credentials to the browser;
- never commit Git changes automatically.

## CLI surface

Add the smallest useful commands:

```text
varai seed validate [repo]
varai handoff [repo] [--json]
varai check [repo] [--json]
```

- `seed validate` validates and canonicalizes the ratified seed.
- `handoff` renders a vendor-neutral build packet.
- `check` scans the repository, loads seed and realization inputs, and renders reconciliation.
- `start` exposes the same seed, model, and reconciliation data in the dashboard.

Do not add a `build` command until Varai actually orchestrates a builder.

## Implementation gates

### Gate 0 — Ratify the product contracts

**Files:**

- Add ADR 0005 covering seed authority, builder witnesses, and reconciliation.
- Update `docs/semantic-language.md` only where the accepted distinction between authored
  commitments and observed Claims needs normative wording.
- Keep `docs/frontier-problem.md` as historical working context.

**Decisions locked:**

- the System Model remains the only analyzer model;
- seed and realization file locations;
- initial seed relations and concept roles;
- binding and verdict state vocabularies;
- no LLM in reconciliation;
- pilot stack and domain.

**Exit:** No code begins while these contracts conflict with existing ADRs.

### Gate 1 — Seed core and file lifecycle

**Likely files:**

- Add `src/seed/schema.js`
- Add `src/seed/validate.js`
- Add `src/seed/canonicalize.js`
- Add `src/seed/identity.js`
- Add `src/seed/store.js`
- Add `test/seed/schema.test.js`
- Add `test/seed/store.test.js`
- Modify `bin/varai.js`

**Tests:**

- valid seed canonicalizes byte-identically under input reordering;
- unknown roles/relations/fields fail clearly;
- dangling concept references fail;
- duplicate stable IDs fail;
- semantic content hash excludes ratification metadata;
- a rename preserves identity;
- changing semantic content invalidates the old ratification hash;
- atomic writes never expose a partial seed;
- paths cannot escape the repository root.

**Exit:** A hand-authored Slotkeeper seed validates through the CLI and is safe to version in Git.

### Gate 2 — Reconciliation walking skeleton

Prove the thread before building the full UI or pilot app. Use the existing
`semantic-assembly-structural` fixture with a tiny seed and manually authored realization file.

**Likely files:**

- Add `src/reconciliation/schema.js`
- Add `src/reconciliation/resolve.js`
- Add `src/reconciliation/check.js`
- Add `src/reconciliation/report.js`
- Add `test/reconciliation/resolve.test.js`
- Add `test/reconciliation/check.test.js`
- Add `test/fixtures/semantic-assembly-structural/varai.seed.json`
- Add `test/fixtures/semantic-assembly-structural/varai.realization.json`

**First commitments:**

- `Apply change invokes PUT structural type operation`;
- `Apply change requires integrity acknowledgement`;
- `PUT structural type operation changes BuildingModelDocument`;
- `PUT structural type operation produces StructuralTypeMutationResponse`;
- `PUT structural type operation fails with 409`.

**Tests:**

- correct witness resolves and holds;
- missing witness is unbound;
- wrong selector is stale;
- broad selector is ambiguous;
- removed matching Claim is violated only under analyzed coverage;
- partial effect coverage produces cannot-verify;
- a stale seed hash invalidates all builder witnesses;
- collection reordering produces byte-identical reconciliation;
- every `holds` result cites canonical model Claim IDs and evidence.

**Exit:** `varai check` produces an honest, useful result without any LLM or UI.

### Gate 3 — Vendor-neutral handoff and witness tooling

**Likely files:**

- Add `src/seed/handoff.js`
- Add `src/reconciliation/witness-store.js`
- Add focused CLI parser tests
- Modify `bin/varai.js`

**Tests:**

- handoff is deterministic for the same ratified seed;
- handoff never includes unratified draft content;
- witness file rejects unknown seed IDs and invalid anchors;
- witness seed hash must equal the current ratified seed hash;
- one concept may have multiple bindings and one binding may support multiple commitments;
- source lines alone are not accepted as semantic identity.

**Exit:** The packet can be pasted unchanged into Codex or Claude, and either can return a schema-valid
realization file.

### Gate 4 — Seed Studio with one assistant adapter

**Likely files:**

- Add `src/seed/assistant.js`
- Add `src/seed/assistants/openai-compatible.js` or the selected first adapter
- Add `src/server/seed.js`
- Modify `src/server/index.js`
- Modify `src/ui/index.html`
- Modify `src/ui/app.js`
- Modify `src/ui/styles.css`
- Add server and UI-focused tests

**Endpoints:**

- `GET /api/seed`
- `POST /api/seed/draft`
- `POST /api/seed/ratify`
- `GET /api/reconciliation`

**Tests:**

- fake assistant proposals cannot bypass validation;
- draft does not alter ratified seed;
- ratify writes exactly the reviewed canonical draft;
- unsupported prose remains visible rather than disappearing;
- outbound assistant calls are explicit and omit repository code;
- mutation endpoints reject invalid origin, oversized body, and path escape;
- UI renders proposal diff and requires explicit ratification.

**Exit:** A human can author and ratify the first Slotkeeper seed from the dashboard.

### Gate 5 — Build Slotkeeper through an actual coding agent

Create the separate pilot repository only after Gates 1–4 fix the contracts.

**Process:**

1. Author and ratify Slotkeeper seed v1 through Seed Studio.
2. Add a concise build brief for stack and presentation preferences.
3. Generate the build packet.
4. Give it to one real coding agent.
5. Let the agent implement the complete runnable application and tests.
6. Require the agent to emit `varai.realization.json` while it builds.
7. Do not manually repair the witness before the first Varai check; record its natural failures.

**Application acceptance:**

- UI lists slots and supports booking/cancellation;
- API enforces availability and cancellation authorization;
- SQLite persistence works;
- booking/cancellation create notification work;
- meaningful success and failure tests pass;
- repository is independently runnable;
- no Varai-specific implementation convention is used beyond the realization contract.

**Exit:** A normal AI-built application exists from a ratified seed, with an imperfect but parseable
builder witness.

### Gate 6 — Close only the analyzer gaps exposed by the pilot

Run current Varai against Slotkeeper before modifying extractors. Classify every failed commitment:

- bad seed predicate;
- bad builder witness;
- resolver limitation;
- missing canonical Claim;
- insufficient coverage;
- genuinely missing application behavior.

Add only the smallest generic analyzer capability needed for the chosen commitments. Every extractor
increment must include:

- a reduced concept fixture in Varai;
- canonical model assertions;
- coverage assertions;
- evidence assertions;
- meaningful before/after diff assertions;
- serial/worker and native/WASM parity;
- `EXTRACTOR_VERSION` bump;
- `SYSTEM_MODEL_ANALYZER_VERSION` bump when analyzer semantics change.

Do not patch the reconciliation layer to compensate for missing artifact evidence.

**Exit:** Most checkable v1 commitments reach `holds`; remaining gaps are honestly `cannot_verify` or
genuine implementation defects.

### Gate 7 — Domain Review Loop in the dashboard

**Likely files:**

- Add `src/server/reconciliation.js`
- Extend `src/server/projections.js` only to serialize already-derived reconciliation data
- Modify `src/ui/app.js`
- Modify `src/ui/styles.css`
- Extend source/evidence tests

**Review output:**

- seed overview;
- realized/missing/unverified counts;
- commitment cards grouped by behavior/resource;
- domain → interface → behavior → effect path;
- evidence and implementation drill-down;
- explicit coverage limitations;
- recommended code-reading sequence;
- builder witness distinguished visually from independently observed evidence.

**Exit:** A person who did not build Slotkeeper can answer within five minutes:

- what the system is intended to do;
- where booking and cancellation are realized;
- which rules are supported by evidence;
- what Varai could not determine;
- which code deserves inspection.

### Gate 8 — Evolution and adversarial proof

Ratify seed v2 with administrator override, displacement notification, and audit creation. Ask the
same or another coding agent to implement it and update witnesses.

Exercise:

- seed diff before code change;
- missing realization before the builder runs;
- updated realization after build;
- a deliberately stale witness;
- a deliberately wrong witness;
- an implementation refactor with unchanged seed;
- a changed effect with unchanged public route;
- an unsupported claim that must remain cannot-verify;
- an unbound domain-relevant mutation within a declared closed scope, if closed-scope support is
  reached safely.

**Exit:** Varai distinguishes intent change, implementation change, binding change, and analyzer
uncertainty instead of collapsing them into one diff.

## Test and verification matrix

Every gate finishes with focused tests, then:

```text
npm test
git diff --check
```

The completed slice must additionally verify:

- seed canonicalization is deterministic;
- reconciliation is deterministic;
- no network is used during verification;
- no LLM is needed by `varai check`;
- no repository content is uploaded silently;
- snapshots still contain only the canonical System Model;
- seed and witness files never enter model snapshots as a second payload;
- native/WASM and serial/worker output remain equal;
- a model-only reconciliation/UI change does not bump the extraction cache;
- extraction changes do bump the required versions;
- current `map`, `snapshot`, `diff`, and dashboard views continue working without a seed;
- repositories without a seed degrade to today's observed-system experience.

## Explicit deferrals

- automatic interception of coding-agent edit operations;
- cryptographic signing of witnesses;
- automatic witness generation independent of the builder;
- existing-code seed backfill;
- multiple simultaneous LLM providers;
- hosted collaboration and accounts;
- full runtime tracing;
- general temporal or invariant logic;
- proof-carrying code;
- universal domain ontology;
- semantic-region completion as a prerequisite;
- unconditional orphan or absence claims;
- automatic Git commits;
- a built-in code editor.

## Failure criteria

Stop and revise the mechanism rather than adding UI polish if any of these occur:

- the human cannot understand the ratified seed without reading JSON internals;
- the builder cannot emit a witness without extensive implementation-specific ceremony;
- most useful commitments cannot map to current System Model relations;
- wrong witnesses routinely produce plausible `holds` results under the chosen checks;
- the verifier needs an LLM to decide verdicts;
- coverage cannot distinguish violation from inability to analyze;
- reconciliation requires copying the System Model into a second persisted graph;
- the review view is not materially better than asking the coding agent to explain its own code.

## Definition of done

The vertical slice is complete when a fresh user can:

1. run `varai start ../varai-slotkeeper-pilot`;
2. describe Slotkeeper and ratify a structured seed;
3. copy a generated build packet to a coding agent;
4. receive a runnable application and realization witness;
5. run `varai check ../varai-slotkeeper-pilot` with no LLM involved;
6. inspect holds, violations, ambiguity, stale bindings, and cannot-verify results with evidence;
7. navigate from a domain commitment to the relevant implementation path;
8. amend the seed, rebuild, and see intent and realization evolve separately.

The completion decision is then practical:

> Did Varai let a human supervise and read an AI-built system at domain altitude more reliably than
> prompts, code search, Git diff, and the builder's own explanation alone?

If yes, automate witness capture and broaden one evidence axis at a time. If no, identify whether the
failure is seed authoring, witness cost, artifact evidence, satisfaction semantics, or presentation
before expanding scope.
