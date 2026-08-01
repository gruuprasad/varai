# AI-Assisted Development Roles and Signal Pilot Plan

Status: Proposed implementation plan  
Date: 2026-08-01

## Outcome

Build Varai as the single application-development interface through which one
new-age developer can operate several AI-assisted development roles over one
shared application core. Prove the design by building a fresh Signal
application through Varai in a separate sibling repository:

```text
/home/gp/dreamLand/jodulabs/varai-signal-role-pilot
```

The existing `varai-signal-pilot` remains untouched as evidence from the
earlier workflow.

The product loop is:

```text
one change
  -> AI-assisted development roles
  -> one human-ratified Seed
  -> one merged build contract
  -> one builder
  -> one independently observed System Model
  -> one verifier
  -> role-specific evidence and AI-assisted review
  -> one human decision
```

## Product invariants

1. A development role owns a responsibility, not files or an agent.
2. The same person may operate every development role.
3. All roles use the same Seed, System Model, change, and evidence.
4. Accepted role contributions become ordinary Seed content.
5. Roles never create independent specifications or persisted role models.
6. One builder receives one consolidated, conflict-resolved contract.
7. The verifier runs once; role views only project its evidence.
8. AI advice cannot ratify intent, set coverage, set deterministic verdicts,
   or mark a build ready.
9. Parser observations and role-specific traces remain private implementation
   details. The System Model remains the only canonical analyzer model.
10. Unsupported claims remain visibly unverified.
11. The new Signal application is built through Varai, not manually built and
    retrospectively described.

## Terminology and authority

### System actors

| Actor | Authority |
| --- | --- |
| Human | Owns and ratifies intent and consequential decisions |
| Role assistant | Advises within a development responsibility |
| Builder | Changes the application implementation in a recorded session |
| Verifier | Establishes deterministic evidence and declared limitations |
| AI evaluator | Produces attributed advisory judgment |

The same Luna model may power role assistance, building, and advisory
evaluation, but every invocation has a distinct context and authority.

### Development roles

The initial roles are:

- Product
- Frontend
- Backend
- Architecture
- AI Behavior
- Verification

A development role is not a user identity, permission, separate conversation,
or dedicated builder agent.

## Component model

```text
Development Interface
  conversation, active role, review, build, result
          |
Intent and Change Core
  approved Seed + draft + semantic diff + ratification
          |
Development Role Engine -------- Verification Planner
  context + AI + contribution      intent -> evidence method
          |                               |
          +---------------+---------------+
                          |
                 one approved Seed
                          |
                  Build Orchestrator
                 one merged build packet
                          |
                  working application
                          |
                  Observation Core
             repository -> canonical System Model
                          |
                  Verification Core
       reconciliation + surfaces + scenarios + coverage
                          |
                  Role Evidence Projector
                          |
             human accepts or starts next change
```

These are logical components inside the existing Node modular monolith, not
services.

## Core models

### Change

Do not add a new persisted Change IR. A change is already represented by:

```text
ratified Seed
+ active authoring draft
+ semantic Seed diff
+ recoverable conversation
```

The active draft remains bound to its base Seed hash. Approval produces one
new ratified Seed hash.

### Development role definition

A role is a small built-in definition:

```js
{
  id: "frontend",
  label: "Frontend",
  responsibility: "User-facing interaction and interface behavior",
  assistantInstruction: "...",
  projectContext: projectFrontendContext,
  projectEvidence: projectFrontendEvidence,
}
```

Do not add base classes, plugins, role configuration, registration lifecycle,
or dependency injection.

### Role context

The role engine derives a bounded context from existing authorities:

```text
role identity and responsibility
approved Seed
current proposed change
relevant System Model elements and Claims
relevant existing verification evidence
declared coverage limitations
conversation history
```

Role assistants receive System Model facts rather than unrestricted source
code. The complete Seed remains present so a scoped role cannot contradict an
unseen product rule.

### Role contribution

Reuse the existing assistant proposal boundary:

```json
{
  "draft": {},
  "questions": [],
  "unsupported": []
}
```

The role assistant receives the current full draft and returns a complete
updated draft. Conversation entries gain only an optional role attribution:

```json
{
  "role": "assistant",
  "developmentRole": "frontend",
  "content": "..."
}
```

Accepted role work therefore becomes ordinary concepts, commitments,
surfaces, scenarios, state models, field contracts, flows, or context.

### Verification obligation

A verification obligation is a pure projection, never a second persisted IR:

```text
intent ID
relevant development roles
verification method
responsible checker capability
required coverage
runtime scenario when applicable
binding/observability requirements
blocking status
observed result after building
```

Initial method classification:

| Seed construct | Verification method |
| --- | --- |
| Commitment | Deterministic reconciliation or recorded-only |
| Surface | Public-surface accounting |
| Scenario | Bounded runtime execution |
| State transition | Static transition reconciliation |
| Field contract | Static contract reconciliation |
| Flow | Member-readiness projection |
| Context | Explicitly not machine-checked |

### Role review

Post-build AI review is attributed advisory build evidence:

```json
{
  "role": "frontend",
  "seedHash": "...",
  "treeHash": "...",
  "sessionId": "...",
  "summary": "...",
  "findings": [
    {
      "kind": "concern",
      "statement": "...",
      "evidenceIds": ["..."],
      "certainty": "observed|inferred|judgment"
    }
  ],
  "questions": [],
  "recommendation": "accept|investigate|change"
}
```

The recommendation never changes readiness. Acting on a finding begins a new
change.

## Role contracts

### Product

Sees actors, behaviors, journeys, flows, product rules, protected behavior,
and product-level verifier results. AI helps with scope, contradictions,
missing cases, outcomes, and understandable acceptance scenarios. It
contributes concepts, commitments, flows, scenarios, and context.

### Frontend

Sees UI surfaces and elements, UI-triggered behavior, navigation, journeys,
relevant API outcomes, UI coverage, and runtime evidence. AI helps with
interaction states, loading, empty and failure behavior, accessibility,
responsiveness, information hierarchy, and source traceability. It contributes
UI surfaces, frontend scenarios, navigation outcomes, and experience context.

### Backend

Sees API/service operations, resources, contracts, state effects, failure
outcomes, authorization requirements, and runtime operation mappings. AI helps
with validation, state transitions, persistence, consistency, authorization,
and preventing partial mutation. It contributes commitments, fields, state
models, API surfaces, and runtime scenarios.

### Architecture

Sees subsystems, dependencies, invocation boundaries, external systems,
runtime processes, architectural context, and drift. AI helps identify
consequential choices, compare approaches, preserve reversibility, and avoid
premature complexity. It initially contributes through existing commitments
and context. Do not introduce a decision schema until the pilot proves context
is inadequate.

### AI Behavior

Sees AI-invoking behavior, input/output contracts, provider boundaries,
failure behavior, source relationships, and AI evaluation scenarios. AI helps
with grounding, uncertainty, classification boundaries, structured output,
provider failure, and evaluation cases. It contributes behavior commitments,
outcomes, scenarios, failure rules, and recorded qualitative expectations.

### Verification

Sees every approved intent item, planned method, coverage, bindings, runtime
maps, scenario results, regressions, and unaccounted behavior. AI helps propose
adversarial cases, checkable reformulations, and evidence requirements. The
deterministic verifier—not this role assistant—sets verdicts.

## Role interaction and builder effect

Roles do not prompt separate builders:

```text
Product contribution ------+
Frontend contribution -----+
Backend contribution ------+--> current Seed draft
Architecture constraint ---+
AI behavior contribution --+
Verification scenarios ----+
                                |
                         human ratification
                                |
                         one builder packet
```

Every role turn sees the draft produced by prior turns. Conflicts become
explicit questions before ratification. The builder receives only the resolved
contract.

The builder remains one recorded Codex CLI session using `gpt-5.6-luna`.
Dedicated frontend/backend agents and parallel task routing are deferred until
one builder demonstrably fails because of context or safe parallel work exists.

## Verifier enhancement workstream

The role system is useful only if the forward builder pass leaves enough
observable information for the backward verifier pass. This work ships in the
same implementation program rather than being deferred behind UI roles.

### 1. Pre-build verification plan

Derive and display how every ratified item will be checked before the build:

```text
intent
  -> method
  -> responsible capability
  -> required observability
  -> required coverage
  -> blocking rule
```

The human must see which claims are deterministic, scenario-based, advisory,
recorded-only, or currently unsupported before approval.

### 2. Complete scenario transfer

`src/seed/handoff.js` currently summarizes scenarios to names, principal names,
and step counts. Change the builder packet to include exact:

- principals and actor bindings;
- ordered steps;
- behavior invocations;
- inputs;
- capture names and references;
- expected statuses;
- partial expected response bodies.

This is the clearest missing forward-pass information and is required in the
first implementation slice.

### 3. Required observability contract

For every checkable commitment and surface, tell the builder which stable
boundaries must remain observable. Use the existing realization v2 mechanisms:

- allow one concept to bind to multiple meaningful artifacts;
- require separate UI/API/data bindings where the behavior crosses boundaries;
- use stable public keys first and source symbols only as fallback;
- use witnesses as narrowing hints, never proof;
- require runtime operations for scenario behaviors;
- require explicit personas for scenario actors.

Do not introduce a new trace or witness format in this pass. Add it only if the
multi-binding model fails on concrete Signal trials.

### 4. Obligation-to-evidence report

After building, report every obligation through one stable shape:

```text
approved intent
planned verification method
resolved implementation bindings
independently observed evidence
coverage
result
limitation or next action
```

Role reports filter and explain this ledger; they do not recompute or override
the result.

### 5. Coverage and anti-gaming

Preserve and strengthen the existing rule that reduced analyzability is a
regression. A builder must not make a violation disappear by moving code into
an unsupported shape. The gate must continue to block:

- analyzed coverage degrading to partial/unsupported/failed;
- a prior `holds` becoming `cannot_verify`;
- stale or ambiguous required bindings;
- missing or unaccounted public surfaces;
- failed or unrun critical scenarios;
- violated state or field contracts.

The pre-build plan must also warn when a newly approved critical obligation has
no current checker capability. It is not ready merely because there is no
baseline regression.

### 6. Evidence authority labels

Keep these result classes distinct in UI and stored evidence:

- deterministic static observation;
- deterministic bounded runtime result;
- measured result under declared conditions;
- human judgment;
- AI judgment;
- cannot verify.

AI/human assessments may guide the next change but never promote an unsupported
claim to `holds`.

## Builder contract

The merged packet must contain:

1. Approved Seed hash.
2. Full approved Seed semantics.
3. Exact change against the latest ready baseline.
4. Protected unchanged behavior.
5. Complete scenarios.
6. Derived verification obligations.
7. Expected public surfaces.
8. Required stable realization bindings.
9. Required runtime operations and personas.
10. Known uncheckable or advisory claims.
11. Architecture and AI-provider context.
12. Carry-forward candidates that still require lint/resolution.

Role labels may explain provenance but do not create several packets.

## Varai implementation phases

### Phase 0: Pin the architecture

Add `docs/adr/0010-ai-assisted-development-roles.md` and update:

- `PRODUCT.md`
- `docs/product-control-room.md`
- `docs/semantic-language.md`
- `docs/roadmap.md`
- `docs/the-varai-idea.md`

Document the actor/role distinction, authority rules, one-loop model, role
contracts, verifier enhancement, and separate Signal proof repository.

Exit: terminology and authority are unambiguous.

### Phase 1: Verification plan and complete handoff

Add:

- `src/reconciliation/verification-plan.js`
- `test/reconciliation/verification-plan.test.js`

Modify:

- `src/seed/handoff.js`
- `src/server/control-room.js`
- `src/ui/intent-view.js`
- `src/ui/develop-view.js`
- `test/seed/handoff.test.js`
- relevant server and UI tests

Deliver the pre-build verification plan, full scenario packet, observability
requirements, and obligation classifications.

Exit: every ratified construct has a declared method or explicit unsupported
classification, and the builder receives every scenario detail.

### Phase 2: Development role engine

Add:

- `src/development-roles/definitions.js`
- `src/development-roles/project.js`
- `test/development-roles/definitions.test.js`
- `test/development-roles/project.test.js`

Implement fixed role definitions, context/evidence projection, deterministic
ordering, role validation, and explicit coverage preservation.

Exit: the same Seed/System Model/report projects through every role without
source mutation or a second model.

### Phase 3: Role-aware authoring

Modify:

- `src/seed/assistant.js`
- `src/seed/assistants/command.js`
- `src/seed/assistants/openai-compatible.js`
- `src/seed/authoring-session.js`
- `src/server/seed.js`
- `src/server/index.js`
- `src/ui/develop-view.js`
- `src/ui/app.js`
- `src/ui/styles.css`

Implement role selection, role-attributed turns, scoped System Model context,
role-specific assistant instruction, one evolving full draft, and one final
approval.

Exit: the developer can move Product -> Frontend -> Backend while evolving one
recoverable draft.

### Phase 4: Role evidence after build

Modify:

- `src/product-blueprint/project.js`
- `src/server/control-room.js`
- `src/ui/blueprint-view.js`
- `src/ui/verification-view.js`
- `src/ui/develop-view.js`

Implement role-filtered evidence and attention over shared verdict IDs, plus
the obligation-to-evidence report. Preserve one readiness gate.

Exit: a cross-role requirement appears in several role views with one verdict.

### Phase 5: Advisory post-build role review

Add:

- `src/development-roles/review.js`
- focused tests for normalization, provenance, staleness, and authority

Reuse build-session content-addressed objects and the configured Luna command
adapter. Store role review output with Seed/session/tree hashes. Add a Develop
action that converts a finding into a new proposed change.

Exit: AI review can recommend action but cannot change Seed, evidence, coverage,
verdicts, or readiness.

## Fresh Signal application repository

Create only after Phases 0-3 work:

```text
/home/gp/dreamLand/jodulabs/varai-signal-role-pilot
```

Initialize through Varai:

```bash
node ./bin/varai.js create ../varai-signal-role-pilot
node ./bin/varai.js start ../varai-signal-role-pilot --no-open
```

Do not copy the old Signal implementation, Seed, tests, realization, or runtime
map. The old repository is a behavioral reference only.

## Signal product contract

Signal is a low-noise knowledge network where contributions are judged by
informational value rather than engagement.

Required product behavior:

- people submit contributions to topics;
- AI extracts traceable claims;
- contributions are classified as new, redundant, corroborating, or
  conflicting;
- the feed emphasizes meaningful topic changes rather than repetition;
- disagreement remains visible;
- every claim retains source contribution IDs;
- human/AI authorship does not change content ranking;
- AI failure does not mutate topic state.

Frontend expectations:

- finite digest rather than infinite scrolling;
- no likes, follower counts, streaks, or engagement ranking;
- topic detail shows brief, claims, sources, uncertainty, and disagreement;
- submission explains its classification;
- loading, error, empty, and conflict states;
- keyboard-accessible responsive interface.

Backend expectations:

- contributions and derived claims persist in SQLite;
- provider failure leaves stored state unchanged;
- claims retain source contribution IDs;
- topic history records meaningful changes;
- explicit public API contracts;
- deterministic fake AI provider for tests and runtime scenarios.

Pilot architecture:

```text
React + Vite
FastAPI
SQLAlchemy
SQLite
synchronous HTTP
local Codex command
gpt-5.6-luna
```

The AI command is behind one replaceable module. Invalid, missing, timed-out,
or malformed AI output returns an explicit unavailable result and does not
mutate application state. No API platform or API key is used.

## Signal development sequence through roles

1. Product establishes actors, topics, contributions, claims, digest,
   disagreement, source traceability, and non-engagement principles.
2. Frontend establishes digest/topic/submission interactions, accessibility,
   and all meaningful interface states.
3. Backend establishes API surfaces, persistence, field/state contracts,
   effects, failure behavior, and source preservation.
4. Architecture confirms the supported stack, boundaries, provider process,
   and deferred production concerns.
5. AI Behavior defines structured input/output, classification boundaries,
   uncertainty, disagreement preservation, and failure semantics.
6. Verification adds scenarios for new, redundant, corroborating, conflicting,
   source tracing, finite digest, provider failure, malformed output, and
   unexpected surfaces.
7. The human ratifies one consolidated Seed and starts one build.

## Verification and trials

### Varai repository

- focused role definition/projection tests;
- assistant role-attribution and recoverability tests;
- verification-plan classification tests;
- complete scenario-handoff tests;
- shared-verdict role-projection tests;
- authority tests proving AI cannot ratify or set verdicts;
- serial/worker and native/WASM parity remains unchanged;
- run `npm test`.

### Signal repository

- backend API/contract/state tests;
- all four classifications;
- source preservation;
- disagreement visibility;
- no mutation on provider failure or malformed output;
- persistence across restart;
- frontend interaction-state tests;
- repeatable fake-provider runtime scenarios.

Run:

```bash
node ./bin/varai.js map ../varai-signal-role-pilot
node ./bin/varai.js realization lint ../varai-signal-role-pilot
node ./bin/varai.js runtime derive ../varai-signal-role-pilot
node ./bin/varai.js verify scenarios ../varai-signal-role-pilot --json
node ./bin/varai.js check ../varai-signal-role-pilot --json
```

Run a live advisory Luna sequence:

```text
new -> redundant -> corroborating with support -> conflicting correction
```

Assess classification plausibility, grounding, source preservation,
disagreement visibility, and uncertainty. Store this as AI judgment, never
deterministic proof.

### Adversarial trials

Deliberately introduce:

1. an extra public API surface;
2. a frontend-only restriction with no backend authorization;
3. AI failure after partial mutation;
4. removed source IDs;
5. a dynamic implementation that degrades analyzer coverage;
6. a builder claim unsupported by independent evidence.

Expected results are `violated`, `needs_attention`, or `cannot_verify`; never
an unsupported ready result.

### Evolution proof

After the greenfield build, develop one meaningful follow-up change:

> Add reader annotations without allowing annotations to alter source claims or
> the living brief.

This proves context continuity, Seed diff, role selection, protected behavior,
carry-forward bindings, regression detection, and continued development rather
than one-shot generation.

## Definition of done

The prototype succeeds when one person can:

1. create the fresh Signal repository through Varai;
2. develop one shared Seed through several AI-assisted roles;
3. understand what each role contributes;
4. see the verification approach before building;
5. approve once;
6. run one builder without managing raw prompts;
7. inspect the running application and independent evidence from Varai;
8. distinguish deterministic evidence from AI/human judgment;
9. find a deliberately introduced mismatch without reading code;
10. make a second change without reconstructing application context;
11. explain the application, architecture, evidence limits, and history from
    Varai alone.

All Varai tests must pass, parser parity must remain intact, and the new Signal
repository must have repeatable application and Varai runtime checks.

## Explicitly deferred

- dedicated builder agent per role;
- parallel agent orchestration;
- multi-user collaboration;
- role permissions or assignments;
- custom role plugins;
- hosted AI APIs and keys;
- deployment orchestration;
- universal performance proving;
- exhaustive framework support;
- a second persisted role, verification, or architecture IR;
- a new realization trace format without a failing concrete trial.
