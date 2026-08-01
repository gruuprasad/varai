# Varai Product Control Room — Execution Plan

**Date:** 2026-07-28  
**Status:** Proposed  
**Goal:** Prove that a non-coding product owner can describe, build, inspect,
change, and govern a multi-role workflow application without losing contact
with the real frontend, backend, data, permissions, or verification state.

## 1. Product decision

Varai will not attempt to become a general AI IDE or a generic prompt-to-app
builder in this plan.

The proof-of-concept product is:

> A local product control room for AI-built operational software. A person
> authors and approves roles, workflows, product surfaces, and concrete
> behavioral scenarios; an interchangeable AI builder implements the approved
> change inside a recorded build session; Varai independently checks the
> resulting system and makes missing, extra, degraded, or unverified behavior
> impossible to mistake for health.

### Initial customer

A domain expert, operator, or product owner who:

- understands how their business process should work;
- does not want to operate primarily through code;
- is willing to inspect a product blueprint and approve explicit changes;
- uses an AI builder for implementation;
- needs more confidence than builder-authored prose or tests provide.

### Initial application class

Multi-role operational and workflow web applications:

- requests and approvals;
- bookings and resource allocation;
- case management;
- membership operations;
- lightweight internal SaaS.

### Constrained substrate

The first proof supports exactly:

- React/Vite frontend;
- FastAPI backend;
- SQLAlchemy with PostgreSQL or SQLite for local execution;
- synchronous HTTP commands and queries;
- local process execution;
- one configured AI-builder subprocess.

Framework breadth is explicitly not a success metric for this plan.

### Proof application

Create a separate sibling repository:

```text
../varai-purchase-approvals-poc
```

Its product rules are:

1. An employee can submit a purchase request.
2. The requester can withdraw only their own pending request.
3. A manager can approve requests at or below a configured threshold.
4. Finance approval is required above that threshold.
5. An approved request creates one purchase order.
6. Every approval, rejection, and withdrawal creates an audit entry.
7. No unauthenticated destructive operation is an approved product surface.

This vertical is selected because it forces Varai to confront ownership,
authorization, state transitions, side effects, and unexpected surface area.

## 2. Non-negotiable architecture

### Authority boundaries

There are three durable authorities, not one blended model:

1. **Seed:** human-owned product intent. An assistant may propose it; only a
   person ratifies it.
2. **System Model:** independently observed repository facts. It remains the
   only public, persisted, versioned analyzer model.
3. **Build/session evidence:** audit records, realization pointers, scenario
   runs, and gate decisions. These are workflow/evidence records, not another
   product IR.

Do not persist an overlay graph combining Seed and System Model. Blueprint,
surface accounting, reconciliation, and build readiness are pure projections.

### One-way editing

- Product chat may create only an unapproved Seed draft.
- Approval creates an immutable Seed content hash.
- A builder may change implementation files and emit untrusted bindings.
- A builder may never edit or approve the Seed.
- The product blueprint is rendered from the Seed and observed System Model; it
  is not independently editable.
- A terminal or builder console never mutates semantic intent.

### Build state machine

Replace the current loose begin/close convention with:

```text
draft
  -> approved
  -> building
  -> verifying
  -> ready | needs_attention | build_failed | superseded
```

Rules:

- `building` requires an exact approved Seed hash.
- Ratifying a changed Seed while a build is active marks the build
  `superseded`; its output can be inspected but cannot become `ready`.
- Builder exit always transitions through `verifying`.
- `ready` requires all release gates below to pass.
- Any repository change after `ready` makes the current state `unattested`
  until another recorded verification completes.
- There is no generic green state with hidden `cannot_verify` results.

### Product readiness gate

A completed build is `ready` only when:

- no ratified requirement is `violated`;
- no critical scenario failed or remained unexecuted;
- no required binding is stale, ambiguous, or unbound;
- no expected public surface is missing;
- no observed public surface is unaccounted;
- no analyzed critical scope degraded to partial/failed/unsupported;
- the realization, runtime mapping, Seed hash, tree hash, and scan configuration
  match the completed session.

Any failure produces `needs_attention` with machine-readable reasons. Human
acknowledgement does not silently turn an unverifiable critical rule green; it
requires a new Seed decision or an analyzer/runtime capability improvement.

## 3. Seed v3: bounded product language

Seed v3 retains v2 concepts, commitments, context, expectation polarity, and
ratification. It adds human-owned `surfaces` and executable `scenarios`.

### Expected surfaces

```json
{
  "id": "surface.withdraw-request-api",
  "name": "Withdraw purchase request API",
  "behavior": "behavior.withdraw-request",
  "channel": "api",
  "access": "authenticated"
}
```

Allowed channels:

```text
ui | api | webhook | job | cli
```

Allowed access:

```text
public | authenticated | internal
```

Surface intent deliberately does not contain an HTTP path, framework name, file,
or symbol. Those remain realization details.

Every observed externally reachable Element in the selected substrate must map
one-to-one to a ratified surface. A UI action and its API operation are separate
surfaces that may refer to the same behavior.

### Product scenarios

Scenarios are bounded ordered interactions, not arbitrary code or a general
predicate language:

```json
{
  "id": "scenario.non-owner-cannot-withdraw",
  "name": "Another employee cannot withdraw a pending request",
  "principals": [
    { "as": "owner", "actor": "actor.employee" },
    { "as": "other", "actor": "actor.employee" }
  ],
  "steps": [
    {
      "id": "submit",
      "as": "owner",
      "invoke": "behavior.submit-request",
      "input": { "amount": 500, "description": "Monitor" },
      "capture": "request",
      "expect": { "status": 201 }
    },
    {
      "id": "withdraw",
      "as": "other",
      "invoke": "behavior.withdraw-request",
      "input": { "requestId": "$request.id" },
      "expect": { "status": 403 }
    },
    {
      "id": "read",
      "as": "owner",
      "invoke": "behavior.get-request",
      "input": { "requestId": "$request.id" },
      "expect": {
        "status": 200,
        "body": { "state": "pending" }
      }
    }
  ]
}
```

Seed v3 supports only:

- sequential steps;
- distinct principals bound to actor concepts;
- behavior invocation;
- scalar/JSON inputs;
- references to captured response fields;
- exact HTTP status assertions;
- partial JSON body assertions.

Concurrency, temporal windows, performance, arbitrary expressions, database
inspection, and user-supplied test code are deferred.

Scenario results prove only the ratified example. The UI and documentation must
not present examples as universal invariant proofs.

### Realization v2

Extend the untrusted builder witness with:

```json
{
  "surfaceBindings": [
    {
      "id": "surface-binding.withdraw-request-api",
      "surface": "surface.withdraw-request-api",
      "artifact": {
        "lens": "api",
        "kind": "operation",
        "key": "POST /api/purchase-requests/{request_id}/withdraw"
      }
    }
  ]
}
```

Concept bindings continue to locate product concepts. Surface bindings account
for externally reachable artifacts. Neither is a verdict.

### Runtime mapping

The builder also emits `varai.runtime.json`, an untrusted pointer map:

```json
{
  "formatVersion": 1,
  "seedHash": "<approved seed hash>",
  "baseUrl": "http://127.0.0.1:8123",
  "healthPath": "/health",
  "operations": [
    {
      "behavior": "behavior.withdraw-request",
      "method": "POST",
      "path": "/api/purchase-requests/{requestId}/withdraw"
    }
  ],
  "personas": [
    {
      "id": "employee-1",
      "actor": "actor.employee",
      "credentialEnv": "VARAI_POC_EMPLOYEE_1_TOKEN"
    }
  ]
}
```

Constraints:

- secrets are referenced by environment-variable name and never persisted;
- every runtime operation must resolve to the same canonical API Element as an
  approved surface binding;
- a scenario requiring two principals of the same actor type receives two
  distinct personas;
- the runner never trusts the manifest's claim that an operation is correct; it
  calls the operation and checks the response independently.

## 4. Implementation gates

The gates are sequential. Do not begin managed-builder or control-room polish
until the semantic proof gate at the end of Gate 5 passes.

---

## Gate 0 — Restore a truthful baseline

**Purpose:** Remove known false status before building further.

**Modify:**

- `test/server/reconciliation.test.js`
- `docs/roadmap.md`
- `docs/product-loop-pilot.md`

**Tasks:**

- Update the stale test at line 64: the fixture now produces `violated` under
  element-scoped analyzed coverage, so it must no longer appear in
  `coverageLimitations`.
- Add an assertion that the same commitment appears as `violated` in its review
  group with analyzed coverage evidence.
- Run the full suite and record the exact pass/fail count. Do not infer success
  from truncated output; preserve the command exit status.
- Correct any documentation that claims `npm test` passes before the suite
  genuinely passes.
- Record the real Slotkeeper baseline:
  - 17 requirements;
  - 12 `holds`;
  - 1 `cannot_verify`;
  - 4 `not_checkable`;
  - zero analyzed records on its three real routes.

**Verification:**

```bash
node --test test/server/reconciliation.test.js
npm test
node ./bin/varai.js check ../varai-slotkeeper-pilot --no-cache
```

**Exit criteria:**

- Full suite exits zero.
- Documentation and automated checks describe the same baseline.

---

## Gate 1 — Freeze the product contract

**Purpose:** Prevent the implementation from drifting back toward a generic IDE
or architecture viewer.

**Create:**

- `docs/adr/0007-product-control-room-and-constrained-substrate.md`
- `docs/product-control-room.md`
- `docs/examples/purchase-approvals.seed.v3.json`

**Modify:**

- `README.md`
- `docs/roadmap.md`
- `docs/glossary.md`
- `docs/semantic-language.md`

**Tasks:**

- Record the customer, application class, constrained stack, authority
  boundaries, state machine, readiness gate, and explicit non-goals.
- Hand-author the complete purchase-approval Seed v3 example before
  implementing the schema.
- Verify that a domain owner can read the example without knowing HTTP paths,
  source files, ORM calls, or framework terminology.
- Include all seven proof-application rules as commitments/scenarios/surfaces.
- Add an explicit truth table describing what each evidence source can prove:

| Source | Can establish | Cannot establish alone |
| --- | --- | --- |
| Static System Model | routes, effects, dependencies, public artifacts | runtime authorization correctness, atomicity |
| Runtime scenario | one concrete interaction and observed result | universal invariant |
| Realization/runtime map | where to check | correctness |
| Builder tests/prose | supporting testimony | verdict |

**Exit criteria:**

- The example expresses owner-versus-other authorization, threshold approval,
  state preservation after denial, purchase-order creation, and audit creation.
- No scenario or surface contains implementation vocabulary.
- No generic expression language is introduced.

---

## Gate 2 — Reach field-grade coverage without making uncertainty cheap

**Purpose:** Make real FastAPI routes eligible for sound omission detection while
ensuring an unknown helper remains loud.

**Modify:**

- `src/scanners/behaviors/body.js`
- `src/scanners/behaviors/signature.js`
- `src/scanners/lift/behavior-coverage.js`
- `src/scanners/cache.js`
- `test/behaviors/body-depth.test.js`
- `test/behaviors/body-effects.test.js`
- `test/behaviors/signature.test.js`
- `test/system-model/behavior-coverage.test.js`

**Create:**

- `test/fixtures/fastapi-coverage-realistic/app/main.py`
- `test/fixtures/fastapi-coverage-realistic/app/models.py`
- `test/fixtures/fastapi-coverage-realistic/app/db.py`
- `test/fixtures/fastapi-coverage-realistic/pyproject.toml`
- `test/system-model/fastapi-real-route-coverage.test.js`
- `test/reconciliation/coverage-adversary.test.js`

**Implementation:**

- Traverse handler body calls from the function body node, not the entire
  function node. `Depends(...)`, `Header(...)`, decorators, and annotation
  constructors are signature/framework mechanics, not unresolved body calls.
- Treat a constructor as known only when it resolves to a registered schema or
  model declaration. Do not add arbitrary constructor names to a global noise
  list.
- Preserve unknown body helpers as uncertainty. Adding
  `mystery_side_effect()` to an otherwise analyzed handler must downgrade the
  affected effect/failure coverage.
- Keep effect and failure coverage element-scoped.
- Bump `EXTRACTOR_VERSION` because extraction/trace completion changes.
- Add the real Slotkeeper route shapes to a small fixture: dependency injection,
  headers, model construction, local notification helper, database read/write,
  and HTTP failures.

**Adversarial assertions:**

1. A route containing `Depends`, `Header`, and a known model constructor reaches
   `api.effect: analyzed` when every body call is understood.
2. Deleting a known write under analyzed coverage produces `violated`.
3. Adding one unresolved helper changes coverage to `partial` and the
   commitment to `cannot_verify`.
4. That degradation is observable as a regression; it is not green.
5. Native/WASM and serial/worker models remain canonical-equal.

**Verification:**

```bash
node --test test/behaviors/body-depth.test.js \
  test/behaviors/body-effects.test.js \
  test/behaviors/signature.test.js \
  test/system-model/behavior-coverage.test.js \
  test/system-model/fastapi-real-route-coverage.test.js \
  test/reconciliation/coverage-adversary.test.js
node --test test/scanner-parity.test.js test/treesitter-cache.test.js
node ./bin/varai.js check ../varai-slotkeeper-pilot --no-cache
npm test
```

**Exit criteria:**

- Slotkeeper's three real FastAPI operations have element-scoped analyzed
  effect/failure coverage unless a specific body call is genuinely unresolved.
- Unknown helpers still prevent absence claims.
- No false `holds` are introduced.

---

## Gate 3 — Make degradation a build result

**Purpose:** Prevent a builder from converting a violation into a calm
`cannot_verify` by making the implementation harder to analyze.

**Create:**

- `src/build-session/evaluate.js`
- `src/build-session/state.js`
- `test/build-session/evaluate.test.js`
- `test/build-session/coverage-regression.test.js`

**Modify:**

- `src/build-session/commands.js`
- `src/build-session/store.js`
- `src/evolution/project.js`
- `src/evolution/report.js`
- `src/reconciliation/report.js`
- `bin/varai.js`
- `test/build-session/lifecycle.test.js`
- `test/evolution/project.test.js`

**Implementation:**

- Define coverage identity as capability + exact scope semantic identity, not
  collection index or evidence location.
- Classify transitions:

```text
unchanged | improved | degraded | analyzer_version_changed
```

- A transition from `analyzed` to `partial`, `unsupported`, `failed`, or missing
  is `degraded`.
- Load the start and completion System Models when evaluating build close.
- Persist a pure gate result in the completed session:

```json
{
  "state": "ready|needs_attention|build_failed|superseded",
  "reasons": [],
  "coverageRegressions": [],
  "requirementRegressions": []
}
```

- `varai build close` exits non-zero for `needs_attention` and
  `build_failed`, while still recording the completed evidence.
- `varai build status` prints the gate state and reason counts.
- Progression distinguishes:
  - `holds -> cannot_verify`;
  - `holds -> violated`;
  - analyzer-version changes;
  - evidence-only movement.
- The dashboard must label coverage regression as regression, not as a neutral
  limitation.

**Tests:**

- Add an unresolved helper after the build baseline:
  `analyzed -> partial`, gate `needs_attention`.
- Remove an unresolved helper:
  `partial -> analyzed`, `improved`.
- Change only analyzer version: report separately; do not attribute it to the
  application.
- Move evidence without semantic or coverage change: no regression.

**Verification:**

```bash
node --test test/build-session/*.test.js test/evolution/*.test.js
npm test
```

**Exit criteria:**

- No build with a newly degraded critical scope can report `ready`.
- Every non-ready state has an actionable machine-readable cause.

---

## Gate 4 — Add expected and unaccounted product surfaces

**Purpose:** Establish the missing code-to-spec direction for externally
reachable behavior.

**Create:**

- `src/seed/surfaces.js`
- `src/reconciliation/surface.js`
- `src/reconciliation/surface-report.js`
- `test/seed/surface-schema.test.js`
- `test/reconciliation/surface-accounting.test.js`
- `test/reconciliation/unaccounted-surface.test.js`
- `test/reconciliation/surface-adversary.test.js`

**Modify:**

- `src/seed/schema.js`
- `src/seed/validate.js`
- `src/seed/canonicalize.js`
- `src/seed/identity.js`
- `src/seed/migrate.js`
- `src/seed/handoff.js`
- `src/seed/assistants/openai-compatible.js`
- `src/reconciliation/schema.js`
- `src/reconciliation/check.js`
- `src/reconciliation/resolve.js`
- `src/reconciliation/witness-store.js`
- `src/reconciliation/commands.js`
- `src/reconciliation/report.js`
- `src/build-session/evaluate.js`
- `src/server/reconciliation.js`
- `src/ui/spec-view.js`
- `src/ui/report-view.js`
- `test/reconciliation/witness-schema.test.js`
- `test/seed/v1-migration.test.js`

**Schema:**

- Introduce Seed format version 3 with required `surfaces` and `scenarios`
  arrays; `scenarios` may remain empty until Gate 5.
- Continue reading Seed v1/v2.
- Migration v2 -> v3 is explicit and produces an unapproved draft with empty
  surfaces/scenarios. Varai must not infer human intent from current code.
- Introduce realization format version 2 with `surfaceBindings`.

**Observed public-surface contract:**

The first substrate treats these canonical Elements as externally reachable:

- API operations;
- UI screens and user actions;
- webhooks;
- scheduled/background job entry points;
- CLI commands.

Internal helpers, data entities, schemas, and components are not public surfaces.
Put the allowlist in one framework-neutral surface contract module; analyzers
continue to emit ordinary canonical Elements.

**Projection output:**

```json
{
  "expected": [],
  "accounted": [],
  "missing": [],
  "unaccounted": [],
  "ambiguous": [],
  "stale": []
}
```

Rules:

- Each ratified surface must resolve to exactly one observed public Element.
- Each observed public Element must be claimed by exactly one ratified surface.
- Builder-authored concept bindings do not count as human approval of a public
  surface.
- Reusing one surface binding for two Elements is ambiguous.
- Reusing one Element for two surfaces is ambiguous.
- An extra route remains unaccounted even when all commitments hold.
- The only way to accept a legitimate new public surface is a reviewed Seed v3
  change followed by ratification and rebinding.

**Adversarial tests:**

1. Add unauthenticated `DELETE /api/purchase-requests/{id}`: unaccounted.
2. Point an expected surface at that DELETE operation: the intended operation
   becomes unaccounted/missing; no green result.
3. Bind two surfaces to one route: ambiguous.
4. Rename/move a handler without changing its public key: binding survives.

**Exit criteria:**

- The check report says both “did you build what was asked?” and “what public
  behavior exists that was not asked for?”
- A build with any missing, unaccounted, stale, or ambiguous critical surface
  is `needs_attention`.

---

## Gate 5 — Execute ratified product scenarios independently

**Purpose:** Move beyond structural scanner restatements and catch authorization
or state-transition mistakes through independently controlled behavior checks.

**Create:**

- `src/seed/scenarios.js`
- `src/runtime/schema.js`
- `src/runtime/validate.js`
- `src/runtime/store.js`
- `src/runtime/resolve.js`
- `src/runtime/http-runner.js`
- `src/runtime/commands.js`
- `src/runtime/report.js`
- `test/seed/scenario-schema.test.js`
- `test/runtime/validate.test.js`
- `test/runtime/resolve.test.js`
- `test/runtime/http-runner.test.js`
- `test/runtime/authorization.test.js`
- `test/runtime/state-transition.test.js`
- `test/cli/runtime-verify.test.js`

**Modify:**

- `src/seed/schema.js`
- `src/seed/validate.js`
- `src/seed/canonicalize.js`
- `src/seed/handoff.js`
- `src/seed/assistants/openai-compatible.js`
- `src/reconciliation/check.js`
- `src/reconciliation/report.js`
- `src/build-session/commands.js`
- `src/build-session/evaluate.js`
- `src/build-session/store.js`
- `bin/varai.js`

**CLI:**

```text
varai verify scenarios [repo] [--json]
```

**Runtime rules:**

- Load only a ratified Seed v3.
- Validate `varai.runtime.json`; require the exact Seed hash.
- Resolve every runtime operation against an approved surface binding and the
  canonical API Element.
- Start the configured application without a shell, using explicit executable
  and argument arrays.
- Wait for bounded health readiness.
- Allocate distinct configured personas for scenario principals.
- Execute steps sequentially.
- Resolve `$capture.path` references deterministically.
- Compare status and partial JSON bodies exactly.
- Redact configured credential values from stored request/response evidence.
- Bound body sizes, timeouts, redirects, and total scenario duration.
- Store an immutable content-addressed run record under:

```text
.varai/verification-v1/
```

The run record contains scenario/step IDs, sanitized requests, responses,
assertions, timestamps, Seed hash, tree hash, runtime-map hash, and final
pass/fail/error. It is an evidence record, not a System Model.

**Reconciliation integration:**

- Add a separate top-level `scenarios` section to the check/build report.
- Do not translate runtime success into static Claims.
- A scenario may be:

```text
passed | failed | could_not_run
```

- `could_not_run` is never a pass.
- Builder-authored tests appear only as optional supporting metadata.

**Semantic proof tests:**

Using a small FastAPI fixture:

1. Correct owner-only withdrawal passes.
2. Inverting the owner condition fails the non-owner scenario.
3. Returning 403 without preserving state fails the follow-up state assertion.
4. Omitting audit creation fails the audit-observation step.
5. Mapping the scenario to a different route fails runtime/static resolution.
6. Supplying a fake successful builder test does not change the verdict.

**Semantic proof gate:**

Stop before Gate 6 unless all three deliberately seeded faults are caught:

- omitted audit write;
- inverted authorization;
- unrequested destructive route.

The first two must be caught by independent runtime/static evidence; the third
must be caught by surface accounting. False passes must remain zero.

**Verification:**

```bash
node --test test/seed/scenario-schema.test.js test/runtime/*.test.js \
  test/reconciliation/surface-*.test.js
node ./bin/varai.js verify scenarios test/fixtures/purchase-approval-runtime
npm test
```

**Exit criteria:**

- The Seed expresses meaningful product behavior not copied from scanner output.
- The independent runner catches inverted authorization and missing audit/state
  behavior.
- No product rule depends solely on builder-authored prose or tests.

---

## Gate 6 — Add a managed, vendor-neutral builder

**Purpose:** Put the existing builder inside the trusted session lifecycle
without making Varai a general IDE or trusting builder narration.

**Create:**

- `src/builder/adapter.js`
- `src/builder/process-adapter.js`
- `src/builder/store.js`
- `src/builder/commands.js`
- `src/server/builder.js`
- `test/builder/process-adapter.test.js`
- `test/builder/session-integration.test.js`
- `test/server/builder.test.js`
- `test/cli/build-run.test.js`

**Modify:**

- `src/build-session/commands.js`
- `src/build-session/store.js`
- `src/build-session/state.js`
- `src/server/index.js`
- `src/server/watcher.js`
- `bin/varai.js`

**Adapter boundary:**

```js
{
  id,
  async start({ cwd, packetPath, signal, onEvent }),
  async send({ sessionId, message }),
  async stop({ sessionId })
}
```

The first implementation wraps one explicitly configured local CLI process.
The core must not import a vendor SDK.

**CLI:**

```text
varai build run [repo] --adapter <configured-id>
varai build message [repo] "<product clarification>"
varai build stop [repo]
varai build status [repo] [--json]
```

**Security and lifecycle:**

- Spawn with `shell: false`.
- Executable and fixed arguments come from local Varai configuration, never an
  arbitrary browser request.
- Working directory is the exact project root or an isolated worktree.
- Pass only an allowlisted environment.
- Stream stdout/stderr as bounded structured events.
- Persist transcript/events as audit evidence, never as verdicts.
- On normal builder exit, transition automatically to `verifying`, rescan,
  execute scenarios, reconcile surfaces/requirements, and evaluate readiness.
- On process failure, record `build_failed`.
- On Seed change, mark `superseded`.
- Manual repository edits during an active session are allowed and recorded as
  intervention; edits after completion make the state `unattested`.
- Do not expose an arbitrary browser terminal in this gate. The “builder
  console” is logs plus product-level messages.

**Tests:**

- Use a deterministic fake subprocess; tests never call a real provider.
- Verify abort, non-zero exit, output bounding, environment filtering,
  supersession, automatic verification, and crash recovery.
- Restart the server mid-build and recover session status without inventing a
  running process.

**Exit criteria:**

- One command takes an approved Seed through build and automatic verification.
- The same session works with a fake adapter and one real configured AI CLI.
- Builder output cannot directly set gate state or verdicts.

---

## Gate 7 — Build the product control-room UX

**Purpose:** Make the product useful without requiring JSON, code reading, or a
terminal-centered workflow.

**Create:**

- `src/product-blueprint/project.js`
- `src/server/control-room.js`
- `src/ui/blueprint-view.js`
- `src/ui/build-view.js`
- `src/ui/verification-view.js`
- `test/product-blueprint/project.test.js`
- `test/server/control-room.test.js`
- `test/ui/blueprint-view.test.js`
- `test/ui/build-view.test.js`
- `test/ui/verification-view.test.js`

**Modify:**

- `src/server/index.js`
- `src/server/seed.js`
- `src/server/reconciliation.js`
- `src/ui/app.js`
- `src/ui/intent-view.js`
- `src/ui/spec-view.js`
- `src/ui/report-view.js`
- `src/ui/styles.css`

**Primary navigation:**

```text
Blueprint | Change | Build | Verify | Architecture
```

### Blueprint

Render a pure Seed projection:

- actors;
- capabilities/behaviors;
- expected UI/API/job surfaces;
- scenario journeys;
- resources and observed states where available.

Overlay observation state without persisting an overlay:

```text
realized | missing | unaccounted | ambiguous | unverifiable
```

### Change

- Product-level chat is the primary authoring surface.
- Every turn shows the proposed Seed diff.
- Questions and unsupported statements remain in an explicit unresolved queue.
- Approval is disabled while unresolved items exist.
- A user may explicitly:
  - answer;
  - convert an item to recorded context;
  - remove it through a reviewed proposal.
- Normal use never requires pasting Seed JSON.

### Build

- Show immutable approved Seed fingerprint.
- Show builder status, changed files, event/log stream, interventions, and
  preview link.
- Product messages go through the adapter.
- No semantic object can be edited here.

### Verify

Lead with decisions:

- missing required behavior;
- failed scenario;
- unaccounted public surface;
- coverage degradation;
- stale/ambiguous binding;
- unattested changes.

Architecture and source evidence remain available as drill-down, not as the
first screen.

### Architecture

Present product-relevant frontend/backend/data structure:

- user surface -> API operation -> resource/effect;
- approved versus observed surfaces;
- module dependencies;
- evidence location;
- current versus previous build.

Keep the existing System Model projections as the source. Do not introduce a
second architecture graph.

**UX tests:**

- Browser-safe rendering tests for all states.
- Keyboard/accessibility assertions for approval and decision actions.
- Local browser end-to-end test:
  chat draft -> resolve questions -> approve -> start fake build -> verify ->
  inspect failed rule -> rerun -> ready.
- The ready state must be visually impossible when any critical gate fails.

**Exit criteria:**

- A user can complete the POC loop without editing JSON or reading code.
- Every red/unknown state links to exact product rule, surface, scenario step,
  coverage record, and source/runtime evidence.

---

## Gate 8 — Build and evaluate the purchase-approval proof

**Purpose:** Decide whether Varai is a product control room or should narrow to
an architecture/developer tool.

### Repository

Create `../varai-purchase-approvals-poc` from a minimal owned scaffold. Do not
copy the implementation into Varai fixtures. Reduce every discovered analyzer
or checker defect to a small Varai fixture/test.

### Required trials

1. **Green build:** all seven product rules, expected surfaces, and scenarios
   pass.
2. **Omitted audit:** remove audit creation; build is not ready.
3. **Inverted authorization:** allow another employee to withdraw; scenario
   fails.
4. **State corruption after denial:** return 403 after mutating state; follow-up
   assertion fails.
5. **Unexpected DELETE route:** all positive requirements still hold, but the
   route is unaccounted and blocks readiness.
6. **Coverage poisoning:** add an unresolved helper to an analyzed critical
   route; coverage regression blocks readiness.
7. **Pure refactor:** move helpers/files while preserving public identities;
   no product regression.
8. **Product change:** raise the manager threshold through chat, approve,
   rebuild, and show the exact blueprint/scenario/implementation progression.
9. **Outside-session edit:** modify the ready repository; status becomes
   unattested.

### Human evaluation

Run the workflow with at least five target users. Give them these tasks:

1. Explain who may approve which request using only Blueprint.
2. Change the approval threshold through chat.
3. Decide whether to accept a newly proposed public endpoint.
4. Identify why a deliberately broken build is not ready.
5. Find the frontend, backend, and data evidence without reading a full diff.

Capture:

- time to first approved Seed;
- assistant turns and unresolved items;
- manual JSON edits: target zero;
- manual binding edits by the human: target zero;
- time to understand a failed rule;
- false-green count: must be zero;
- unaccounted-surface detection: 100% of seeded extras;
- critical scenario execution: 100%;
- user explanation accuracy before/after using Blueprint;
- whether users choose the blueprint/change interface over raw builder chat for
  the second change.

### Product release gate

Proceed toward a product only if:

- all nine technical trials produce the expected state;
- false greens remain zero;
- all five users can make the threshold change without JSON/code;
- at least four of five correctly explain the authorization model and broken
  build;
- the runtime mapping requires no per-change manual repair by the product owner;
- the architecture view changes at least one real user decision;
- verification adds understandable confidence rather than merely more status.

### Stop or pivot conditions

Stop expanding the builder/control-room product if any is true:

- meaningful policies cannot be expressed without implementation vocabulary;
- runtime verification requires bespoke per-app test code;
- a seeded authorization/surface fault can still produce `ready`;
- users treat the blueprint as decoration and return to raw builder chat;
- keeping mappings current costs more human effort than reviewing generated
  code for the chosen vertical.

If semantic checks work but target users reject the workflow, pivot Varai toward
an AI-development architecture/trust tool for developers. Do not respond by
adding more frameworks or a larger IDE.

## 5. Technical risks and containment

### Coverage is implementation-shape-sensitive

An unresolved call may genuinely hide an effect. Do not solve this by declaring
unknown calls harmless. Recognize only known framework/schema/model mechanics,
and make every new degradation a build-level decision.

### Runtime evidence can be gamed

The runtime map is a pointer, not proof. Cross-resolve it with approved surfaces
and canonical Elements, execute it independently, use real public operations,
and keep builder tests out of verdict authority.

### Scenarios are examples, not invariants

Use precise language in reports. “Scenario passed” is acceptable; “only owners
can ever withdraw” is not established by two examples. General property and
concurrency checking is a later research gate.

### Closed-world surface accounting is easy to overclaim

Claim completeness only for the selected stack and declared public-element
capabilities. Unsupported frameworks and dynamic route registration must
produce `cannot_account`, not a clean empty set.

### Builder integration can consume the product

Keep the adapter small and replaceable. Do not implement model routing,
deployment hosting, a code editor, arbitrary shell access, or provider-specific
workflow semantics in this plan.

### Authoring may become JSON with chat decoration

Measure unresolved questions, user corrections, and manual JSON edits. If the
assistant cannot reliably produce the bounded Seed v3 for the proof vertical,
improve the authoring protocol before expanding the language.

## 6. Explicitly deferred

- general-purpose IDE or browser code editor;
- arbitrary application stacks;
- hosted repository upload;
- production deployment/hosting;
- universal policy or temporal-logic language;
- general invariant proving;
- concurrency and atomicity proof;
- performance/SLA verification;
- mobile/native applications;
- builder model marketplace;
- automatic inference of human intent from code;
- JavaScript/TypeScript analyzer breadth unrelated to the proof application.

## 7. Verification discipline

Every gate ends with:

```bash
npm test
node --test test/scanner-parity.test.js test/treesitter-cache.test.js
git diff --check
```

For scanner changes:

- bump `EXTRACTOR_VERSION`;
- test canonical model output;
- test coverage and evidence;
- test meaningful before/after diff;
- preserve native/WASM and serial/worker parity.

For product statements:

- deterministic observation;
- evidence-backed inference;
- or explicit `cannot_verify` / `not_checkable` / `unaccounted`.

No LLM output may set a verdict, coverage state, surface-accounting state,
scenario assertion, or readiness gate.

## 8. Recommended commit sequence

1. `test: restore truthful reconciliation baseline`
2. `docs: define constrained product control room`
3. `fix(scanner): complete realistic FastAPI route coverage`
4. `feat(build): gate coverage and verdict regressions`
5. `feat(seed): add ratified product surfaces`
6. `feat(check): report unaccounted public surfaces`
7. `feat(seed): add bounded product scenarios`
8. `feat(runtime): execute scenarios independently`
9. `feat(builder): run builders inside recorded sessions`
10. `feat(ui): add blueprint build and verification control room`
11. `test(poc): complete purchase approval adversarial trials`

## 9. First implementation slice

Begin with Gates 0–2 only.

Do not start Seed v3, runtime execution, builder integration, or UI redesign
until:

- the stale suite failure is fixed;
- the full suite genuinely exits zero;
- realistic FastAPI routes reach analyzed coverage;
- an unresolved helper remains partial;
- coverage degradation is ready to become a first-class build gate.

This slice is intentionally dry. It makes the later product experience credible
instead of wrapping an unproven verifier in a polished chat interface.
