# Intent → Build → Verify Product Loop Execution Plan

> **For agentic workers:** Execute gate by gate. Keep the suite green at every
> commit. Do not start a later gate until the preceding exit criteria are met.

**Goal:** Turn Varai's working one-time seed/reconciliation slice into a
repeatable product loop in which a person can form and approve a specification,
give it to any AI builder, independently verify both realized and omitted
requirements, and understand what changed across later specification and
implementation revisions.

**Core loop:**

```text
human conversation
  → approved Seed
  → recorded build interval + vendor-neutral build packet
  → builder realization testimony
  → independently recovered System Model
  → deterministic requirement verdicts
  → requirement progression across the next change
```

**Architecture:** The Seed remains the only human-owned intent artifact. The
System Model remains the only public, persisted, versioned analyzer model.
Realization remains untrusted builder testimony. Build-session records capture
inputs and repository transitions but never authorize a Claim or verdict.
Authoring state and build-session state live under ignored `.varai/` storage and
never enter semantic snapshots. Reconciliation and evolution remain pure
projections; no combined intent/implementation graph is persisted.

**Tech stack:** Node 20+ ESM, Node built-in test runner, Node built-ins for local
storage and Git, vanilla browser modules, existing System Model scanner and
snapshot store.

---

## Why this plan supersedes the initial proposal

The initial proposal correctly prioritized build provenance, guided intent
formation, relation-specific checking, negative requirements, and evolution.
Repository and Slotkeeper inspection exposed three ordering corrections:

1. **A matching seed hash is freshness, not provenance.** Slotkeeper's checked-in
   build packet names the original seed while the current realization merely
   copies the later seed hash. `varai check` calls that map current because it
   cannot distinguish a rebuild from a reviewed carry-forward.
2. **The handoff overstates its realization contract.** It requires per-
   requirement `witnesses`, but reconciliation deliberately produces the same
   verdicts from concept bindings alone. It also asks the builder to bind every
   concept even though recorded-only actors need no implementation binding.
3. **Presence is stronger than absence today.** Behavioral coverage is normally
   `partial` at subsystem scope. Real code can confirm an observed Claim, but an
   omitted requirement usually becomes `cannot_verify`, not `violated`.

Therefore the execution order is:

```text
soundness scenarios
  → deep relation-checking module
  → element-scoped absence coverage
  → honest realization contract
  → recorded build intervals
  → multi-turn specification formation
  → negative requirements
  → evolution projection
  → adversarial pilot proof
```

Do not lead with more analyzer breadth, a richer starter template, or dashboard
polish. The milestone succeeds only when the loop detects an intentional
omission and explains an ordinary later change.

---

## Decisions locked by this plan

### 1. “Spec” is a human-facing projection over the Seed

Do not introduce `varai.spec.json`. `varai.seed.json` remains the source program.
The dashboard may call its rendered form “Spec,” but authoring, handoff, and
verification all reference the same semantic content hash.

### 2. Requirement verdict and build provenance are separate axes

A Claim may structurally hold even when no recorded build interval exists.
Conversely, a recorded build interval never proves a requirement. Reports expose
both:

```text
requirement verdict: holds | violated | cannot_verify | not_checkable
build provenance: recorded_build | recorded_carry_forward | unattested | stale
```

“Recorded” means Varai observed repository states before and after the declared
activity. It does not claim the builder caused every change.

### 3. Concept bindings are the realization contract

`bindings` map Seed concepts to independently observed Elements. Existing
per-commitment `witnesses` are optional source-binding hints only when one
concept has multiple bound artifacts. They are not proof and are not required
for ordinary one-binding concepts.

For positive requirements, any selected source artifact may supply the matching
Claim. For negative requirements, hints may not narrow the search: every bound
source artifact must be checked.

### 4. Absence needs exact coverage

Subsystem-level `partial` coverage cannot establish absence. A checker may
return `violated` for an expected-present requirement, or `holds` for an
expected-absent requirement, only when the responsible analyzer has declared
the relevant capability `analyzed` for every resolved source Element involved
in that check. Whole-subsystem coverage remains valid only for capabilities
whose analyzer contract is genuinely subsystem-complete, initially
`arch.dependency` for supported Python scope.

### 5. Negative requirements use polarity, not a fake kernel relationship

Seed format v2 adds `expectation: "present" | "absent"` to commitments, defaulting
to `present` during explicit v1 migration. The System Model continues to record
positive observations only. Do not add `forbids` to the kernel.

### 6. Runtime qualities remain explicitly deferred

Atomicity, concurrency, delivery guarantees, and temporal ordering require
executable or runtime evidence. Do not infer them from transaction-looking code
in this milestone. Preserve them as human-owned context until a later evidence
adapter can emit Claims into the same System Model.

---

## Success criteria

All of the following must be true before calling this product loop proven:

- A user can conduct at least two assistant turns before approving a Seed.
- Questions and unsupported statements cannot silently disappear at approval.
- The assistant never receives repository code or local credentials.
- The build packet accurately describes which concepts need bindings and when
  optional source-binding hints are useful.
- `varai check` detects a deliberately omitted Slotkeeper requirement as
  `violated` inside declared analyzed coverage.
- A lying or collided binding cannot produce `holds`.
- A stale realization, stale build session, analyzer limitation, and actual
  requirement violation render as distinct states.
- A recorded carry-forward is accepted only when the scanned implementation
  tree is unchanged.
- One expected-absent dependency requirement can both hold and fail under
  analyzed coverage.
- The progression view distinguishes Seed, implementation, binding, coverage,
  and verdict changes.
- Serial/worker and native/WASM parity remain intact.
- `npm test` passes.

---

## Gate 0 — Lock the trust contract and falsification corpus

**Purpose:** Make the failure modes executable before restructuring production
modules.

**Files:**

- Create: `docs/adr/0006-recorded-builds-and-requirement-checking.md`
- Create: `test/product-loop/scenarios.js`
- Create: `test/product-loop/soundness.test.js`
- Modify: `docs/glossary.md`
- Modify: `docs/roadmap.md`

### Tasks

- [ ] Write ADR 0006 recording the six decisions above: one Seed, one System
  Model, separate provenance/verdict axes, bindings as the realization contract,
  element-scoped absence coverage, and Seed polarity.
- [ ] Add pure inline scenario builders for:
  - truthful binding + present Claim;
  - omitted Claim under analyzed coverage;
  - omitted Claim under partial coverage;
  - wrong target binding;
  - two concepts colliding on one Element;
  - one concept bound to two Elements;
  - stale seed hash;
  - expected-absent Claim present/absent;
  - analyzer-version-only change;
  - recorded build versus carry-forward.
- [ ] Pin current behavior where it is already sound.
- [ ] Mark the desired omission, negative-requirement, and provenance outcomes
  as skipped tests with the target reason in the test name. Do not commit a red
  suite.
- [ ] Update the glossary with “build session” and “requirement progression.”
- [ ] Update the roadmap so the immediate milestone is this loop rather than
  generic adversarial hardening.

### Verification

```bash
node --test test/product-loop/soundness.test.js
npm test
```

Expected: green suite with explicit skipped future assertions.

### Exit criteria

- Every later gate maps to at least one named scenario.
- ADR 0006 does not weaken ADR 0004 or ADR 0005.
- The report vocabulary does not imply that a recorded build proves causality.

### Stop condition

If the team cannot agree that build provenance and structural verdicts are
independent axes, stop. Combining them would let missing bookkeeping invalidate
observed code truth—or let bookkeeping authorize a false verdict.

---

## Gate 1 — Deepen relation checking behind one interface

**Purpose:** Concentrate relation semantics, Claim matching, coverage rules, and
verdict production before adding polarity or finer coverage.

**Files:**

- Create: `src/reconciliation/relations.js`
- Modify: `src/reconciliation/check.js`
- Modify: `src/reconciliation/schema.js`
- Modify: `src/seed/assistants/openai-compatible.js`
- Modify: `src/seed/handoff.js`
- Create: `test/reconciliation/relations.test.js`
- Modify: `test/reconciliation/check.test.js`
- Modify: `test/reconciliation/witness-schema.test.js`
- Modify: `test/seed/assistant.test.js`
- Modify: `test/seed/handoff.test.js`

### Required module shape

`src/reconciliation/relations.js` becomes the single interface callers use to
learn how a Seed relation is checked. It owns:

- whether the relation is checkable or recorded-only;
- responsible analyzer capabilities;
- allowed target kind at check time;
- positive Claim matching;
- coverage grain (`element` or `subsystem`);
- source-binding quantification;
- deterministic literal matching.

Keep the implementation data-driven while existing relations share semantics.
Do not create one shallow file per relation. A custom evaluator is justified
only when a second real semantic shape appears.

### Tasks

- [ ] Move `RELATION_CAPABILITIES` and `literalMatches` into the relation module.
- [ ] Export one relation lookup and one evaluation entry point; `check.js`
  should orchestrate binding resolution and delegate relation evaluation.
- [ ] Preserve byte-identical reconciliation output for every current fixture.
- [ ] Keep the invariant that every `SEED_RELATIONS` entry is exactly one of
  checkable or recorded-only.
- [ ] Fix the assistant system prompt so `performs` is not called checkable.
- [ ] Keep authored vocabulary in `src/seed/schema.js`: the handoff and assistant
  derive their checkable list by filtering `SEED_RELATIONS` against
  `RECORDED_ONLY_RELATIONS`. Do not make Seed modules import reconciliation
  internals. The existing cross-package invariant test pins the two modules
  together without creating a dependency cycle.
- [ ] Preserve Claim IDs, evidence, implementation paths, and coverage in every
  result.

### Verification

```bash
node --test test/reconciliation/relations.test.js \
  test/reconciliation/check.test.js \
  test/reconciliation/witness-schema.test.js \
  test/seed/assistant.test.js \
  test/seed/handoff.test.js
npm test
```

### Exit criteria

- Existing reconciliation is byte-identical for canonical fixtures.
- No prompt or handoff labels `performs` checkable.
- Adding a relation no longer requires editing a free-standing capability table
  plus unrelated matching branches.

---

## Gate 2 — Make omission detectable in one supported vertical slice

**Purpose:** Prove Varai can report a real missing requirement rather than only
confirming present Claims.

**Initial supported slice:** FastAPI operation signature/body tracing with
SQLAlchemy effects. UI and Next.js remain partial until they can make an equally
strong completeness claim.

**Files:**

- Create: `src/scanners/lift/behavior-coverage.js`
- Modify: `src/scanners/behaviors/index.js`
- Modify: `src/scanners/behaviors/signature.js`
- Modify: `src/scanners/behaviors/body.js`
- Modify: `src/scanners/lift/index.js`
- Modify: `src/system-model/coverage.js`
- Modify: `src/reconciliation/relations.js`
- Modify: `src/reconciliation/check.js`
- Modify: `src/scanners/cache.js` (`EXTRACTOR_VERSION`)
- Create: `test/system-model/behavior-coverage.test.js`
- Create: `test/reconciliation/element-coverage.test.js`
- Add fixture: `test/fixtures/product-loop/omitted-effect/`
- Modify: `test/scanner-parity.test.js`

### Coverage contract

Private behavior traces must carry per-capability completion:

```text
api.input
api.output
api.condition
api.effect
api.failure
```

For a recognized FastAPI handler:

- signature capabilities are `analyzed` only when the relevant decorator and
  function signature shapes were fully handled;
- body effect/failure capabilities are `analyzed` only when reachable tracing
  completed without an unresolved call, ambiguous callable, depth-limit exit,
  parse failure, or unsupported dynamic dispatch that could hide that class of
  observation;
- otherwise the capability is `partial`, with exact diagnostic evidence;
- stub route doors without a handled body remain `partial`.

The lift converts those private completion records into canonical Coverage
records scoped to the operation Element ID. Existing subsystem records remain
as broad coverage summaries; they do not override a partial element record.

### Reconciliation rule

For an absent positive Claim:

1. Resolve every source Element selected for the requirement.
2. Prefer exact Element-scoped Coverage.
3. Allow subsystem-scoped coverage only when the relation contract declares
   that grain valid.
4. Return `violated` only when every selected source Element has at least one
   responsible capability at `analyzed`.
5. Otherwise return `cannot_verify`.

### Tasks

- [ ] Add completion metadata to behavior traces without exposing or persisting
  a second analyzer IR.
- [ ] Produce operation-scoped Coverage drafts in `behavior-coverage.js`.
- [ ] Ensure Coverage scope IDs resolve through canonical Element identity.
- [ ] Change reconciliation from “any analyzed record in the subsystem” to the
  all-resolved-source-elements rule above.
- [ ] Add a small before/after fixture where a known SQLAlchemy create/change
  call is removed while the handler remains fully traceable.
- [ ] Assert the present version `holds`, the omitted version `violated`, and an
  otherwise-identical version with one unresolved call returns `cannot_verify`.
- [ ] Bump `EXTRACTOR_VERSION` because extraction/coverage logic changes.
- [ ] Pin cached/uncached, serial/worker, native/WASM canonical parity.

### Verification

```bash
node --test test/system-model/behavior-coverage.test.js \
  test/reconciliation/element-coverage.test.js \
  test/scanner-parity.test.js
npm test
node ./bin/varai.js check ../varai-slotkeeper-pilot --no-cache
```

### Exit criteria

- At least one deliberate Slotkeeper-class omission produces `violated`.
- Introducing an unresolved call into the same behavior degrades the result to
  `cannot_verify`, never a false violation.
- Coverage output names the exact operation and reason for partial analysis.

### Stop condition

If “no untraced calls” is still insufficient to claim completeness for the
chosen syntax slice, narrow the supported slice further. Do not mark a whole
framework or subsystem analyzed merely to unlock `violated`.

---

## Gate 3 — Make the realization and handoff contract honest

**Purpose:** Remove ceremony that the verifier does not use and make
multi-artifact behavior explicit.

**Files:**

- Modify: `src/reconciliation/schema.js`
- Modify: `src/reconciliation/check.js`
- Modify: `src/seed/handoff.js`
- Modify: `src/reconciliation/report.js`
- Modify: `src/ui/review-view.js`
- Modify: `docs/adr/0005-seed-realization-and-reconciliation.md`
- Modify: `docs/spec.md`
- Modify: `docs/glossary.md`
- Modify: `test/seed/handoff.test.js`
- Modify: `test/reconciliation/check.test.js`
- Modify: `test/reconciliation/witness-schema.test.js`
- Modify: `test/ui/review-view.test.js`

### Contract

- Builders bind concepts referenced by **checkable** commitments.
- Recorded-only concepts need no binding.
- A concept may bind several artifacts.
- With no per-commitment hint, a positive requirement checks all source bindings
  existentially and cites the bindings that supplied matching Claims.
- A per-commitment witness may narrow positive source bindings only when the
  source concept has more than one binding.
- Redundant hints for a one-binding concept are valid but omitted from the
  generated example.
- A hint never changes target concept identity and never authorizes a verdict.
- Distinct concepts resolving to the same Element remain ambiguous.

### Tasks

- [ ] Preserve redundant one-binding hints for existing realizations, but make
  them unnecessary: validation still confirms that every hint cites a binding
  for the commitment's source concept.
- [ ] Change check results to distinguish considered bindings from supporting
  bindings.
- [ ] Rewrite the build packet: require concept bindings; explain optional
  source-binding hints only for multi-artifact concepts; do not demand a hint
  for every commitment.
- [ ] Stop asking builders to bind actors or other concepts used only by
  recorded-only commitments.
- [ ] Render “builder suggested looking here” separately from “this binding
  supplied a matching canonical Claim.”
- [ ] Amend ADR 0005 to record this clarification; do not create realization v2
  merely to rename an optional field.
- [ ] Migrate the checked-in test fixture and Slotkeeper realization only if the
  clarified validator requires it.

### Verification

```bash
node --test test/seed/handoff.test.js \
  test/reconciliation/check.test.js \
  test/reconciliation/witness-schema.test.js \
  test/ui/review-view.test.js
npm test
```

### Exit criteria

- A one-binding realization with no `witnesses` checks every checkable
  commitment.
- Multi-binding source selection is deterministic and visible.
- Collision attacks still cannot produce `holds`.
- The build packet matches actual checker behavior.

---

## Gate 4 — Record build intervals without becoming a builder

**Purpose:** Connect an approved Seed, build packet, before/after repository
states, realization, and check result without orchestrating or trusting the AI
builder.

**Commands:**

```text
varai build begin [repo] [--brief <file>] [--json]
varai build close [repo] --mode built|carry-forward [--json]
varai build status [repo] [--json]
```

Keep `varai handoff` as a stateless packet preview. `build begin` is the
stateful path and prints the same packet after recording its input state.

**Files:**

- Create: `src/build-session/schema.js`
- Create: `src/build-session/identity.js`
- Create: `src/build-session/store.js`
- Create: `src/build-session/commands.js`
- Create: `src/build-session/status.js`
- Modify: `src/snapshots/snapshot.js` (export/reuse scanned-tree hashing through
  an intentional interface; do not duplicate it)
- Modify: `src/reconciliation/commands.js`
- Modify: `src/reconciliation/check.js`
- Modify: `src/reconciliation/report.js`
- Modify: `bin/varai.js`
- Create: `test/build-session/schema.test.js`
- Create: `test/build-session/store.test.js`
- Create: `test/build-session/lifecycle.test.js`
- Create: `test/cli/build-session.test.js`

### Local store

Use `.varai/build-v1/` with atomic writes and content-addressed objects:

```text
.varai/build-v1/
  objects/<hash>.json
  sessions/<session-id>.json
  active.json
```

A session references:

- approved Seed object hash and semantic hash;
- exact rendered packet object hash, including build brief;
- start snapshot ID, Git state, scanned-tree hash, and scan-config hash;
- completion mode;
- end snapshot ID, Git state, scanned-tree hash, and scan-config hash;
- realization object hash;
- deterministic reconciliation summary hash;
- timestamps as metadata, excluded from semantic identity.

The captured Seed, packet, and realization are source/audit inputs, not analyzer
models. Only the referenced System Model snapshots use the model store.

### Lifecycle rules

- `begin` requires a valid approved Seed and no other active session.
- `begin` records the current model snapshot and scanned tree, stores the exact
  packet, then prints it.
- `close` requires the Seed hash and scan configuration to match the active
  session.
- `close --mode carry-forward` succeeds only when start and end scanned-tree
  hashes are equal.
- `close --mode built` permits equal tree hashes but emits a warning.
- `close` validates the realization and records an end snapshot before running
  reconciliation.
- `check` searches the latest completed session for exact current Seed hash,
  scanned-tree hash, scan-config hash, and realization object hash.
- No matching session yields `unattested`; mismatch against the latest relevant
  session yields `stale`.
- Provenance state never changes commitment verdicts or the `varai check` exit
  code.

### Tasks

- [ ] Extract a reusable current-repository identity from snapshot analysis.
- [ ] Implement schema validation and content-addressed atomic store.
- [ ] Implement begin/close/status commands and CLI parsing.
- [ ] Refuse nested active sessions with an actionable error.
- [ ] Add provenance to the reconciliation report as a separate top-level field.
- [ ] Render provenance separately in text output.
- [ ] Test dirty start/end states; hashes, not cleanliness alone, determine
  whether the implementation changed.
- [ ] Test packet/realization tampering and interrupted active sessions.

### Verification

```bash
node --test test/build-session/*.test.js test/cli/build-session.test.js
npm test
```

Manual:

```bash
node ./bin/varai.js build begin ../varai-slotkeeper-pilot --brief ../varai-slotkeeper-pilot/BUILD-BRIEF.md
node ./bin/varai.js build status ../varai-slotkeeper-pilot
node ./bin/varai.js build close ../varai-slotkeeper-pilot --mode carry-forward
node ./bin/varai.js check ../varai-slotkeeper-pilot --no-cache
```

Use a disposable worktree for the manual trial. Do not mutate the main
Slotkeeper checkout merely to test the command.

### Exit criteria

- A copied seed hash without a matching recorded repository interval renders
  `unattested`, not “current build.”
- A valid carry-forward proves the analyzed implementation tree did not change.
- Structural `holds` results remain intact when provenance is unattested.

---

## Gate 5 — Turn Seed Studio into multi-turn specification formation

**Purpose:** Help a person reach a small, checkable, explicitly limited Seed
without requiring them to understand its JSON vocabulary.

**Files:**

- Create: `src/seed/authoring-session.js`
- Create: `src/seed/authoring-store.js`
- Modify: `src/seed/assistant.js`
- Modify: `src/seed/assistants/openai-compatible.js`
- Modify: `src/server/seed.js`
- Modify: `src/server/index.js`
- Modify: `src/ui/intent-view.js`
- Modify: `src/ui/app.js`
- Modify: `src/ui/styles.css`
- Create: `test/seed/authoring-session.test.js`
- Create: `test/seed/authoring-store.test.js`
- Modify: `test/seed/assistant.test.js`
- Modify: `test/server/seed.test.js`
- Modify: `test/ui/intent-view.test.js`
- Modify: `test/ui/spec-view.test.js`

### Authoring-session state

Persist working state atomically at `.varai/authoring-v1/session.json`:

- ordered human/assistant conversation;
- current validated proposal;
- open questions;
- unsupported statements;
- validation problems;
- deterministic Seed diff;
- checkability tally;
- provider/model metadata;
- creation/update metadata.

This is private working state, not a second intent artifact, and is deleted only
on explicit discard or successful ratification. Add this clarification to ADR
0006.

### Assistant contract

Each explicit outbound call receives only:

- the conversation;
- the current approved Seed, if any;
- the current proposed draft, if any;
- the bounded Seed vocabulary and relation checkability descriptions.

It never receives repository files, System Model contents, bindings, credentials,
or automatic background messages.

The assistant must cover these prompts when relevant:

- actors and initiated behaviors;
- inputs and outputs;
- resources read or changed;
- success and failure outcomes;
- authorization and availability conditions;
- prohibited interactions;
- statements Varai cannot check;
- change from the currently approved Seed.

These are drafting heuristics, not deterministic completeness claims.

### Ratification readiness

The server computes readiness; the assistant never authorizes it:

- draft validates;
- no open questions;
- no unsupported statements remain outside the Seed;
- recorded-only commitments and context are visibly counted;
- the human explicitly clicks Approve.

Unsupported prose is resolved by revising it into a valid commitment, recording
it as Seed context, or removing it through an explicit reviewed proposal.

### Tasks

- [ ] Add atomic authoring store under `.varai/`.
- [ ] Make each message append to the existing session instead of replacing it.
- [ ] Send current proposal plus conversation on later turns.
- [ ] Normalize assistant output and validate the entire proposed Seed on every
  turn.
- [ ] Add deterministic checkability counts from the relation module.
- [ ] Block ratification while questions/unsupported items remain.
- [ ] Render conversation, open items, proposed spec, diff, and checkability in
  one review flow.
- [ ] Preserve explicit proposal JSON import as the offline/provider-free path.
- [ ] Ensure server restart restores the local draft session.
- [ ] Ensure a changed approved Seed invalidates an older authoring session or
  requires an explicit rebase.

### Verification

```bash
node --test test/seed/authoring-session.test.js \
  test/seed/authoring-store.test.js \
  test/seed/assistant.test.js \
  test/server/seed.test.js \
  test/ui/intent-view.test.js \
  test/ui/spec-view.test.js
npm test
```

### Exit criteria

- A two-turn fake assistant test preserves the first human statement.
- An unsupported statement cannot disappear and still allow approval.
- Restarting the server does not lose a draft.
- No GET or background action calls the provider.
- Captured provider payload contains no repository source or credential.

---

## Gate 6 — Add expected-absent requirements safely

**Purpose:** Let a human prohibit an observed interaction using existing kernel
Claims and strict absence coverage.

**Files:**

- Modify: `src/seed/schema.js` (`SEED_FORMAT_VERSION = 2`,
  `expectation`)
- Modify: `src/seed/validate.js`
- Modify: `src/seed/identity.js`
- Modify: `src/seed/diff.js`
- Modify: `src/seed/commands.js`
- Modify: `src/seed/handoff.js`
- Modify: `src/seed/assistants/openai-compatible.js`
- Modify: `src/reconciliation/relations.js`
- Modify: `src/reconciliation/check.js`
- Modify: `src/reconciliation/report.js`
- Modify: `src/scanners/lift/dependency-edges.js`
- Modify: `src/scanners/lift/index.js`
- Modify: `src/scanners/cache.js` (`EXTRACTOR_VERSION`)
- Modify: `src/ui/spec-view.js`
- Modify: `src/ui/review-view.js`
- Modify: `docs/semantic-language.md`
- Modify: `docs/spec.md`
- Modify: `docs/glossary.md`
- Modify: `bin/varai.js`
- Modify fixtures under `test/seed/`, `test/reconciliation/`, and
  `test/fixtures/semantic-assembly-structural/`
- Create: `test/seed/v1-migration.test.js`
- Create: `test/cli/seed-migrate.test.js`
- Create: `test/reconciliation/negative-requirement.test.js`
- Modify: `test/system-model/arch-units-emit.test.js`

### Migration

Provide a pure explicit migration from Seed v1 to v2:

- every existing commitment receives `expectation: "present"`;
- semantic IDs remain stable;
- the content hash changes and must be re-approved;
- no automatic write happens during validation or check;
- `varai seed migrate [repo]` prints migrated JSON without writing;
- `varai seed migrate [repo] --write` atomically replaces the Seed with an
  unapproved v2 document after validation; it never ratifies;
- no automatic migration happens during validation, authoring, or check.

### Verdict table

| Expectation | Matching strong Claim | Matching weak Claim | No Claim + fully analyzed | No Claim + incomplete |
|---|---|---|---|---|
| `present` | `holds` | `cannot_verify` | `violated` | `cannot_verify` |
| `absent` | `violated` | `cannot_verify` | `holds` | `cannot_verify` |

For `absent`, check all bindings for the source concept. Optional
per-commitment source hints are ignored and reported as non-authoritative.

### Initial product slice

Demonstrate expected absence first with `depends_on`, because Python
`arch.dependency` has a subsystem coverage contract. Before relying on it,
downgrade that coverage to `partial` whenever import extraction or
import-to-Element attribution reports an unresolved edge or symbol collision in
the relevant Python scope. The current unconditional `analyzed` record is not
sound enough for a negative verdict. A conservative whole-Python-scope
downgrade is acceptable initially; a false `cannot_verify` is preferable to a
false `holds`. Add a second FastAPI/SQLAlchemy effect example only after Gate 2
element coverage passes.

Do not add generic orphan detection in this gate. “No matching relation between
these bound concepts” is closed and checkable; “no unaccounted behavior exists”
requires a separate declared closed-scope model.

### Additional tasks

- [ ] Propagate unresolved dependency diagnostics into `arch.dependency`
  coverage.
- [ ] Assert a fully resolved Python dependency scope is `analyzed`.
- [ ] Assert any unresolved import attribution downgrades the affected
  dependency scope to `partial`.
- [ ] Bump `EXTRACTOR_VERSION` for the changed coverage extraction.

### Verification

```bash
node --test test/seed/v1-migration.test.js \
  test/cli/seed-migrate.test.js \
  test/reconciliation/negative-requirement.test.js \
  test/system-model/arch-units-emit.test.js \
  test/reconciliation/check.test.js
npm test
```

### Exit criteria

- An observed forbidden dependency yields `violated` with Claim evidence.
- An absent forbidden dependency yields `holds` only under analyzed coverage.
- The same absence under partial/unsupported coverage yields `cannot_verify`.
- V1 migration is explicit and deterministic.

### Stop condition

If source binding completeness cannot be established for a negative
requirement, return `cannot_verify`. Never let a builder hide a forbidden Claim
by supplying a narrow per-commitment hint.

---

## Gate 7 — Project requirement progression across builds

**Purpose:** Explain why a requirement's status changed without persisting a
combined graph.

**Files:**

- Create: `src/evolution/project.js`
- Create: `src/evolution/commands.js`
- Create: `src/evolution/report.js`
- Create: `src/server/evolution.js`
- Create: `src/ui/evolution-view.js`
- Modify: `src/server/index.js`
- Modify: `src/ui/app.js`
- Modify: `src/ui/styles.css`
- Modify: `bin/varai.js`
- Create: `test/evolution/project.test.js`
- Create: `test/evolution/report.test.js`
- Create: `test/server/evolution.test.js`
- Create: `test/ui/evolution-view.test.js`
- Create: `test/cli/evolution.test.js`

### Projection inputs

Compare two completed build sessions using their content-addressed inputs:

- `diffSeeds(beforeSeed, afterSeed)`;
- `diffSystemModels(beforeModel, afterModel)`;
- realization binding/hint diff;
- coverage diff already present in the model diff;
- reconciliation result diff;
- build provenance metadata.

### Per-requirement output

For each stable commitment ID, report independently:

- Seed state: unchanged, added, removed, changed;
- implementation evidence: unchanged, added, removed, moved;
- binding: unchanged, added, removed, retargeted, stale;
- coverage: unchanged, improved, degraded, analyzer-version-changed;
- verdict transition;
- build transition: recorded build, carry-forward, unattested.

The projection may suggest a deterministic reading order from stored evidence.
It must not invent causal prose such as “the builder broke this.”

### Commands and UI

Add:

```text
varai progression [repo] [--from <session>] [--to <session|current>] [--json]
```

The dashboard receives a serialized pure projection and renders it in a
“Progression” view. Do not overload the existing System Model `diff`; that diff
has a clean single-model responsibility.

### Verification

```bash
node --test test/evolution/*.test.js \
  test/server/evolution.test.js \
  test/ui/evolution-view.test.js \
  test/cli/evolution.test.js
npm test
```

### Exit criteria

- A Seed-only recorded-note change does not appear as implementation drift.
- A refactor with evidence movement does not appear as a semantic requirement
  change.
- An analyzer-version change is visibly distinct from an application change.
- A missing Claim changes the requirement verdict with the exact removed Claim
  and coverage evidence.

---

## Gate 8 — Adversarial Slotkeeper change trials

**Purpose:** Decide whether the mechanism is useful on a real repeated build,
not merely internally consistent.

Use disposable Git worktrees of `../varai-slotkeeper-pilot`. Reduce analyzer
defects found here to small fixtures in Varai; do not turn the pilot itself into
the test suite.

### Trials

- [ ] **New positive requirement:** add a genuine requirement, approve it, begin
  a build, implement it, close the build, and confirm it.
- [ ] **Omitted implementation:** approve a requirement, intentionally omit its
  effect, and require `violated` rather than `cannot_verify`.
- [ ] **Dishonest target binding:** point a new resource concept at an existing
  resource and require ambiguity/no false pass.
- [ ] **Pure refactor:** move implementation evidence without changing Claims
  and require no semantic requirement regression.
- [ ] **Recorded-only change:** add/rename a recorded-only actor statement, use
  reviewed carry-forward, and require an unchanged implementation tree.
- [ ] **Expected-absent dependency:** introduce then remove a prohibited
  dependency and observe `violated → holds`.
- [ ] **Coverage regression:** add an unresolved/dynamic call and require
  `cannot_verify` with the specific coverage reason.

### Capture

Create after the trials:

- `docs/product-loop-pilot.md` — commands, session IDs, exact result table,
  authoring turns, manual witness work, and failures;
- focused fixtures/tests for every Varai defect;
- roadmap update based on measurements, not aspiration.

### Metrics

- minutes from natural-language change to approved Seed;
- number of assistant turns;
- checkable / recorded-only / unresolved statement counts;
- number of manually authored bindings and hints;
- binding survival across refactor;
- `holds` / `violated` / `cannot_verify` distribution;
- false-pass count under adversarial bindings (must be zero);
- whether every non-holds result names an actionable cause.

### Final verification

```bash
npm test
node --test test/scanner-parity.test.js test/treesitter-cache.test.js
node ./bin/varai.js seed validate ../varai-slotkeeper-pilot
node ./bin/varai.js check ../varai-slotkeeper-pilot --no-cache
node ./bin/varai.js progression ../varai-slotkeeper-pilot
```

### Product-loop release gate

Proceed to broader analyzers or builder adapters only if:

- false passes remain zero;
- at least one real omission is reported as `violated`;
- ordinary spec formation does not require manual JSON editing;
- the builder's extra Varai work is mostly concept binding, not repeated
  commitment bookkeeping;
- progression explains every trial without trusting builder prose.

If these fail, narrow or revise the Seed/binding contract before expanding the
product surface.

---

## Explicitly deferred after this plan

These are real gaps, but they should not block proof of the static product loop:

- runtime/test evidence adapters for atomicity, concurrency, delivery, and
  temporal properties;
- actor/authorization verification for recorded-only `performs`;
- generic closed-scope orphan detection;
- stable human-authored arch-unit naming beyond current module rollups;
- JavaScript/TypeScript dependency-edge parity with Python;
- automatic builder orchestration, hosted collaboration, or repository upload;
- broad framework coverage unrelated to a failed pilot decision.

The next plan should choose among these using the Gate 8 measurements. Runtime
evidence is the likely next foundational seam if static `cannot_verify` results
remain concentrated in atomicity and authorization. Stable arch-unit identity
is next if expected-absent dependency rules prove valuable but file-derived
unit names are too brittle to author.

---

## Commit sequence

Use one reviewable commit per completed gate:

1. `docs(test): lock the intent-build-verify trust contract`
2. `refactor(reconciliation): deepen relation checking`
3. `feat(coverage): prove absence for traced API behaviors`
4. `fix(handoff): align realization instructions with reconciliation`
5. `feat(build): record local build intervals`
6. `feat(seed): support multi-turn specification formation`
7. `feat(seed): check expected-absent requirements`
8. `feat(evolution): project requirement progression`
9. `docs: record adversarial Slotkeeper product-loop results`

Before each commit:

```bash
git diff --check
npm test
```

For Gates 2 and 8 also run native/WASM and serial/worker parity tests. Do not
commit `.varai/` state, generated pilot worktrees, credentials, or provider
responses.
